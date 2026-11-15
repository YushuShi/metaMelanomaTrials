"""Project validated canonical graphs into the common PMID study view."""
from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import json
import math
import re
import subprocess
import sys
from pathlib import Path

from article_progress import atomic, writer_lock

PUBLIC = "website/dist/data/clinical_evidence.json"
FLAGS = ("clinical_validation", "clinical_verified", "pooling_eligible", "report_R3_complete",
         "final_R3_complete", "numerical_extraction_complete", "source_report_coverage_complete")
MISSING = {"status": "not_reported", "value": None, "raw_text": None,
           "unit": None, "qualifier": "not_reported", "evidence_ids": []}
NON_MELANOMA = r"\b(?:non[\s\-‐‑‒–—]*|not\s+|without\s+)melanomas?\b"
OTHER_CANCER = r"renal(?:\s+cell)?\s+(?:cancer|carcinoma)|\bRCC\b|lung\s+(?:cancer|carcinoma)|\b[NS]S?CLC\b|(?:non[\s-]*)?small[\s-]*cell lung|urothelial(?:\s+carcinoma|\s+cancer)?|bladder\s+cancer|(?:Hodgkin\s+)?lymphoma|breast\s+(?:cancer|carcinoma)|ovarian\s+(?:cancer|carcinoma)|(?:prostate|colorectal|colon|pancreatic|gastric|thyroid|endometrial|esophageal)\s+(?:cancer|carcinoma)|hepatocellular carcinoma|\bglioma\b|\bglioblastoma\b|\bmesothelioma\b|\bsarcoma\b|\bleuk[ae]emia\b|squamous cell carcinoma"
MIXED_POPULATION = r"mixed[\s-]*(?:cancers?|tumou?rs?|histolog(?:y|ies))|pan[\s-]*cancer|solid tumou?rs?|multiple cancers?|across cancers?|all cancer patients"
NONHUMAN_POPULATION = r"cell lines?|cell cultures?|in vitro|murine|xenograft|mouse|mice|organoids?"


def explicit_melanoma_population(label):
    if not re.search(r"\bmelanomas?\b|\bSKCM\b", label, re.I):
        return False
    # Histologic variation explicitly within melanoma is not a mixture of
    # different cancers. Remove only that unambiguous phrase from the generic
    # mixed-cancer check; preserve the original label and every scope guard.
    scope_label = re.sub(r"\bmixed[\s-]*histolog(?:y|ies)\s+of\s+melanomas?\b|"
                         r"\bmelanomas?\s+(?:of|with)\s+mixed[\s-]*histolog(?:y|ies)\b",
                         "melanoma", label, flags=re.I)
    return (not re.search(MIXED_POPULATION, scope_label, re.I)
            or bool(re.search(r"\bmelanoma\s+(?:trial\s+)?(?:subset|subgroup|cohort|patients?|population)\b|\b(?:with|having)\s+(?:(?:malignant|metastatic|advanced|unresectable|cutaneous|mucosal|acral|ocular|choroidal|uveal)[\s/]+){0,3}melanoma\b", label, re.I)))


def foreign_cancer(text):
    """Explicit excluded diagnoses do not identify the outcome population."""
    value = re.sub(r"\b(?:no|without|excluding)\s+(?:patients?\s+with\s+)?(?:" + OTHER_CANCER + r")", "", text, flags=re.I)
    value = re.sub(r"(?:" + OTHER_CANCER + r")\s+(?:patients?\s+)?(?:were|was|are|is)?\s*excluded\b", "", value, flags=re.I)
    return bool(re.search(OTHER_CANCER, value, re.I))


def need(value, message):
    if not value:
        raise ValueError(message)


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True,
                                    separators=(",", ":"), allow_nan=False).encode()).hexdigest()


def numeric(value):
    return type(value) in (int, float) and math.isfinite(value)


def reported_response_rate(fact):
    return any(n.get("role") in {"percentage", "estimate"} and n.get("status") == "reported"
           and numeric(n.get("value")) and str(n.get("unit") or "").strip().casefold()
           in {"%", "percent", "percentage", "probability", "proportion"} for n in fact.get("numbers", []))


def response_measure_alias(fact):
    """Literal response-rate labels need an explicitly reported rate wrapper."""
    measure = re.sub(r"[\s_]+", " ", str(fact.get("measure") or "").strip().casefold())
    aliases = {"objective clinical response", "objective response rate", "overall response rate", "objective response percentage"}
    return "ORR" if fact.get("clinical_endpoint_family") == "response" and measure in aliases and reported_response_rate(fact) else None


def display_measure_alias(fact):
    """Recognize explicit statistic labels without changing source facts."""
    response = response_measure_alias(fact)
    if response:
        return response
    measure = re.sub(r"[\s_\-]+", " ", str(fact.get("measure") or "").strip().casefold())
    ratios = {"hazard ratio": "HR", "odds ratio": "OR", "risk ratio": "RR", "relative risk": "RR"}
    if measure in ratios:
        return ratios[measure]
    median_labels = {
        "overall_survival": {"median overall survival", "median overall survival time", "median os", "median survival", "median survival time"},
        "progression_free_survival": {"median progression free survival", "median progression free survival time", "median pfs"},
        "recurrence": {"median recurrence free survival", "median relapse free survival", "median disease free survival", "median rfs", "median dfs"},
    }
    if measure in median_labels.get(fact.get("clinical_endpoint_family"), set()):
        return "median"
    return None


def melanoma_population(population, population_evidence):
    if not population or population.get("population_scope") != "melanoma":
        return False
    label = population.get("label", "")
    if re.search(NON_MELANOMA, label, re.I) or foreign_cancer(label):
        return False
    if re.search(MIXED_POPULATION, label, re.I) and not explicit_melanoma_population(label):
        return False
    if re.search(r"cell lines?|in vitro|murine|xenograft|mouse|mice|cell culture|organoids?", label, re.I):
        return False
    positive = re.sub(NON_MELANOMA, "", " ".join(population_evidence), flags=re.I)
    return bool(re.search(r"\bmelanomas?\b|\bSKCM\b", positive, re.I)
                and re.search(r"patients?|participants?|subjects?|clinical|cohort|trial", label + " " + positive, re.I))


def clinical_scope(fact, population, model, endpoint, population_evidence, *, arm=None, experimental=None, comparator=None, mixed_article=False):
    if fact.get("status") != "reported" or fact.get("evidence_origin") != "own_report_results" or fact.get("scope") != "observed":
        return False
    if fact.get("domain") not in {"efficacy_outcomes", "safety_outcomes"} or not melanoma_population(population, population_evidence):
        return False
    if model and (model.get("evidence_origin") != "own_report_results" or model.get("scope") != "observed"):
        return False
    if model and model.get("analysis_population_id") is not None and model["analysis_population_id"] != fact.get("result_population_id"):
        return False
    text = " ".join(str(fact.get(k) or "") for k in ("text", "field", "measure"))
    population_label = population.get("label", "")
    if re.search(r"cell lines?|in vitro|murine|xenograft|mouse|mice|bootstrap|resamples?|simulat", text + " " + population_label, re.I):
        return False
    # A broad melanoma tag or article title cannot override a result-specific
    # foreign cancer, including an explicitly foreign actual arm or model.
    between = bool(re.fullmatch(r"hr|or|rr|shr|tr|rd|md|smd|hazard ratio|odds ratio|risk ratio|relative risk", str(fact.get("measure") or "").strip(), re.I))
    actual_arms = [arm] if arm and not between else [experimental, comparator]
    if mixed_article and not re.search(r"\bmelanomas?\b|\bSKCM\b", " ".join([population_label, *[str(a.get("label") or "") for a in actual_arms if a]]), re.I):
        return False
    local_text = " ".join([text, str((model or {}).get("estimand") or ""), *[str(a.get("label") or "") for a in actual_arms if a]])
    if foreign_cancer(local_text) or re.search(NON_MELANOMA + "|" + NONHUMAN_POPULATION, local_text, re.I):
        return False
    endpoint_label = (endpoint or {}).get("label", "")
    if foreign_cancer(endpoint_label) or re.search(NON_MELANOMA + "|" + NONHUMAN_POPULATION, endpoint_label, re.I):
        return False
    if re.search(r"pharmacokinetic|\bNONMEM\b|population\s+PK|clearance|volume of distribution|Markov|economic|cost.effectiveness|state.transition", str((model or {}).get("family") or "") + " " + str(fact.get("measure") or ""), re.I):
        return False
    if re.search(r"meta.analysis|pooled.{0,25}(?:studies|trials)|cited|literature|previous study", text, re.I):
        return False
    if fact.get("clinical_endpoint_family") == "adverse_events" and re.search(r"toxicit.{0,25}(?:or|and).{0,25}progression|progression.{0,25}(?:or|and).{0,25}toxicit", text, re.I):
        return False
    if not any(n.get("role") in {"estimate", "percentage", "mean", "median", "numerator"}
               and n.get("status") == "reported" and numeric(n.get("value")) for n in fact.get("numbers", [])):
        return False
    measure = str(fact.get("measure") or "").strip().lower()
    if measure and not display_measure_alias(fact) and not re.fullmatch(r"hr|or|rr|shr|tr|rd|md|smd|hazard ratio|odds ratio|risk ratio|relative risk|"
                                   r"percentage|percent|%|proportion|probability|response_probability|orr|cr|pr|nr|"
                                   r"median|mean|n|participant_count|count|rate|time|months?|days?|years?", measure):
        return False
    label = ((endpoint or {}).get("label", "") + " " + text).replace("_", " ")
    patterns = {"overall_survival": r"overall survival|\bOS\b",
                "progression_free_survival": r"progression.free survival|\bPFS\b",
                "recurrence": r"recurrence|relapse|disease.free survival|\b[RD]FS\b",
                "response": r"(?:objective|overall|complete|partial|clinical|tumou?r|no) response|non.response|stable disease|progressive disease|\b(?:ORR|CR|PR|RECIST)\b",
                "adverse_events": r"adverse|toxicit|tolerab|safety|dose reduction|supportive treatment",
                "quality_of_life": r"quality of life|\bQOL\b|patient.reported outcome"}
    return bool(re.search(patterns.get(fact.get("clinical_endpoint_family"), r"(?!)"), label, re.I))


def _graph(citation, stage, review):
    payload = review.get("payload") or {}
    if payload.get("schema_id") != "melanoma-clinical-review":
        need(not payload.get("facts") and not payload.get("models"), "Foreign scientific graph refused")
        return None
    pmid, report_id = str(citation["pmid"]), citation["report_id"]
    need(payload.get("pmid") == pmid and payload.get("report_id") == report_id
         and payload.get("stage") == stage and re.fullmatch(r"[a-f0-9]{64}", payload.get("source_sha256", "")),
         "Canonical report/stage/source identity mismatch")
    binding = digest({"pmid": pmid, "stage": stage, "source_ref": review["source_ref"], "payload": payload})
    namespace = binding[:24]
    prefix = "CE-" + namespace + "-"
    entities = {e["entity_id"]: e for e in payload["entities"]}
    mixed_article = (bool(foreign_cancer(citation.get("title", ""))
                          and re.search(r"\bmelanomas?\b|\bSKCM\b", citation.get("title", ""), re.I))
                     or any(e.get("kind") == "population" and (e.get("population_scope") in {"other_cancer", "mixed_cancers"}
                                or foreign_cancer(e.get("label", ""))) for e in payload["entities"]))
    models = {m["model_id"]: m for m in payload["models"]}
    regimens = {r["arm_id"]: r for r in payload.get("arm_regimens", [])}
    contrast_definitions = {c["contrast_id"]: c for c in payload.get("contrast_definitions", [])}
    need(len(regimens) == len(payload.get("arm_regimens", [])), "Duplicate arm regimen definition")
    need(len(contrast_definitions) == len(payload.get("contrast_definitions", [])), "Duplicate directed contrast definition")
    evidence = {e["evidence_id"]: e for e in payload["evidence"]}
    need(len(entities) == len(payload["entities"]) and len(models) == len(payload["models"])
         and len(evidence) == len(payload["evidence"]), "Duplicate artifact-local IDs")
    registry = {}
    for eid, item in evidence.items():
        need(isinstance(item.get("quote"), str) and item["quote"] and item.get("source_id") and item.get("block_id"),
             "Expanded validated source evidence required")
        registry[prefix + eid] = {"source_id": "source-" + digest(item["source_id"])[:20],
                                 "block_id": "block-" + digest(item["block_id"])[:20],
                                 "supporting_quote": item["quote"]}
    def ids(values):
        need(isinstance(values, list) and all(i in evidence for i in values), "Foreign source evidence")
        return [prefix + i for i in values]
    def entity(ident, kind):
        if ident is None:
            return None
        need(ident in entities and entities[ident]["kind"] == kind, "Foreign/wrong-kind artifact entity")
        return entities[ident]
    def wrapper(number):
        value = deepcopy(number)
        need(value.get("value") is None or numeric(value["value"]), "Nonfinite/boolean clinical number")
        value["evidence_ids"] = ids(value.get("evidence_ids", []))
        return value
    results, samples, comparisons, all_facts = [], [], [], []
    seen = set()
    for fact in payload["facts"]:
        need(fact["fact_id"] not in seen, "Duplicate clinical fact ID")
        seen.add(fact["fact_id"])
        population = entity(fact.get("result_population_id"), "population")
        endpoint = entity(fact.get("endpoint_id"), "endpoint")
        cutoff = entity(fact.get("cutoff_id"), "cutoff")
        arm = entity(fact.get("arm_id"), "arm")
        directed = contrast_definitions.get(fact.get("contrast_id"))
        experimental = entity(fact.get("experimental_arm_id") or (directed or {}).get("experimental_arm_id"), "arm")
        comparator = entity(fact.get("comparator_arm_id") or (directed or {}).get("reference_arm_id"), "arm")
        for key, target in (("experimental_arm_id", "experimental_arm_id"), ("comparator_arm_id", "reference_arm_id")):
            need(not directed or fact.get(key) is None or fact[key] == directed.get(target), "Fact reverses its directed contrast")
        model = models.get(fact.get("model_id"))
        need(fact.get("model_id") is None or model is not None, "Foreign artifact-local model")
        if model:
            for key, kind in (("analysis_population_id", "population"), ("endpoint_id", "endpoint"), ("cutoff_id", "cutoff")):
                entity(model.get(key), kind)
            for ident in model.get("arm_ids", []): entity(ident, "arm")
        numbers = [wrapper(n) for n in fact.get("numbers", [])]
        need(len({n["role"] for n in numbers}) == len(numbers), "Repeated roles must stay separate facts")
        by_role = {n["role"]: n for n in numbers}
        management = fact.get("clinical_endpoint_family") == "adverse_events" and re.search(
            r"dose|concentration|supportive|reduction", str(fact.get("text") or "") + " " + fact["field"], re.I)
        display_roles = {"estimate", "ci_lower", "ci_upper", "confidence_level", "p_value", "numerator", "percentage", "mean", "median", "timepoint", "follow_up"}
        if management:
            display_roles = {"numerator", "timepoint", "follow_up"}
        display_numbers = [n for n in numbers if n["role"] in display_roles]
        display_by_role = {n["role"]: n for n in display_numbers}
        anchors = ids(fact.get("evidence_ids", []))
        population_evidence = [evidence[i]["quote"] for i in (population or {}).get("evidence_ids", []) if i in evidence]
        scoped = clinical_scope(fact, population, model, endpoint, population_evidence, arm=arm, experimental=experimental, comparator=comparator, mixed_article=mixed_article) and any(
            n["role"] in {"estimate", "percentage", "mean", "median", "numerator"} and numeric(n.get("value")) for n in display_numbers)
        own = fact.get("evidence_origin") == "own_report_results" and fact.get("scope") == "observed"
        rid = prefix + "F-" + digest(fact["fact_id"])[:16]
        local_population = prefix + population["entity_id"] if population else None
        contrast = fact.get("contrast_type")
        between_arm = str(fact.get("measure") or "").strip().lower() in {"hr", "rr", "or", "shr", "tr", "rd", "md", "smd", "hazard ratio", "risk ratio", "odds ratio", "relative risk"}
        descriptive_arm = arm if not between_arm else None
        comparison_identity = {k: fact.get(k) for k in
            ("model_id", "result_population_id", "endpoint_id", "cutoff_id", "arm_id", "experimental_arm_id", "comparator_arm_id", "contrast_type")}
        if fact.get("contrast_id") is not None:
            comparison_identity["contrast_id"] = fact["contrast_id"]
        comparison_id = prefix + "C-" + digest(comparison_identity)[:16]
        base = {"result_id": rid, "report_id": report_id, "pmid": pmid, "review_stage": stage,
                "reviewer": "Local source review (original Luna)" if payload.get("reviewer_model") == "local_source_review" else "Sol" if stage == "R2" else "Luna", "evidence_ids": anchors,
                "source_input_sha256": payload["source_sha256"], "review_binding_sha256": binding,
                "record_kind": "canonical_clinical_fact", "original_fact": deepcopy(fact),
                "reported_numbers": display_numbers, "source_reported_numbers": numbers,
                "variable": fact.get("text") or fact["field"],
                "measure_verbatim": fact.get("measure"), "measure": fact.get("measure"),
                "endpoint": {"family": fact.get("clinical_endpoint_family"),
                             "definition": {"text": endpoint["label"] if endpoint else fact["field"],
                                            "evidence_ids": ids(endpoint["evidence_ids"]) if endpoint else anchors}},
                "population_id": local_population, "arm_id": prefix + arm["entity_id"] if arm else None,
                "model_id": prefix + model["model_id"] if model else None,
                "model": deepcopy(model), "population": deepcopy(population),
                "arm": deepcopy(arm), "experimental_arm": deepcopy(experimental), "comparator_arm": deepcopy(comparator),
                "result_relation": "arm_specific" if descriptive_arm else "between_arm" if between_arm and experimental and comparator else "other",
                "contrast_type": contrast, "cutoff": deepcopy(cutoff),
                "comparison_id": comparison_id, "main_result_eligible": scoped,
                "scope": fact.get("scope"), "evidence_origin": fact.get("evidence_origin"),
                "API_verification_pending": False, "validated": False,
                **{flag: False for flag in FLAGS}}
        for role in ("estimate", "ci_lower", "ci_upper", "confidence_level", "p_value", "numerator", "denominator"):
            base[role] = deepcopy(display_by_role.get(role, MISSING))
        # Count purposes do not establish endpoint denominators or fitted N.
        base["analysis_n"] = deepcopy(MISSING)
        base["denominator"] = deepcopy(MISSING)
        alias = display_measure_alias(fact)
        if alias:
            base["display_measure"] = alias
        if base["estimate"]["value"] is None:
            for role in ("percentage", "mean", "median", "numerator"):
                if role in display_by_role:
                    base["estimate"] = deepcopy(display_by_role[role]); break
        identity = (fact["field"] + " " + (endpoint["label"] if endpoint else "")).replace("_", " ")
        text = " ".join([fact.get("text") or "", identity]).replace("_", " ")
        if fact.get("clinical_endpoint_family") == "response":
            for pattern, label in ((r"\bcomplete response\b|\bCR\b", "CR"), (r"\bpartial response\b|\bPR\b", "PR"),
                                   (r"\bno response\b|\bnon.response\b", "No response"), (r"\bstable disease\b", "Stable disease"),
                                   (r"\bobjective response\b|\boverall response\b|\bORR\b", "ORR")):
                if label == "ORR" and not reported_response_rate(fact):
                    continue
                if re.search(pattern, identity, re.I): base["display_measure"] = label; break
        if fact.get("clinical_endpoint_family") == "adverse_events" and "numerator" in display_by_role and not any(r in display_by_role for r in ("estimate", "percentage")):
            base["display_measure"] = "participant_count"
        if fact.get("domain") in {"efficacy_outcomes", "safety_outcomes"}:
            results.append(base)
        all_facts.append({"fact": deepcopy(fact), "main_result_eligible": scoped, "result_id": rid})
        # Preserve the existing source-qualified population/count-purpose gate.
        # Assay/background prose cannot change the counted clinical population;
        # an explicitly foreign/nonhuman actual arm still vetoes projection.
        count_arm_text = str((arm or {}).get("label") or "")
        if own and melanoma_population(population, population_evidence) and not foreign_cancer(count_arm_text) and not re.search(NON_MELANOMA + "|" + NONHUMAN_POPULATION, count_arm_text, re.I) and "sample_size" in by_role:
            n = by_role["sample_size"]; purpose = fact.get("count_context")
            if (purpose in {"enrolled", "eligible", "randomized", "treated", "response_evaluable", "safety", "subgroup"}
                    and re.fullmatch(r"patients?|participants?|subjects?|people|persons?", str(n.get("unit") or ""), re.I)
                    and numeric(n.get("value")) and n["value"] >= 0 and int(n["value"]) == n["value"]
                    and not re.search(r"bootstrap|resampl|simulat|replicates?|cell counts?", str(fact.get("text") or "") + " " + fact["field"], re.I)):
                samples.append({"sample_record_id": rid + "-N", "report_id": report_id, "pmid": pmid,
                    "record_kind": "canonical_patient_context", "review_binding_sha256": binding,
                    "review_stage": stage, "reviewer": base["reviewer"], "n": deepcopy(n),
                    "population_id": local_population, "population": deepcopy(population),
                    "arm_id": prefix + arm["entity_id"] if arm else None, "arm": deepcopy(arm),
                    "sample_context_role": purpose, "quantity_label": fact["field"], "scope": "observed", "evidence_origin": "own_report_results",
                    "evidence_ids": anchors, "main_result_eligible": True, "original_fact": deepcopy(fact),
                    "source_input_sha256": payload["source_sha256"], **{flag: False for flag in FLAGS}})
        if fact.get("domain") not in {"efficacy_outcomes", "safety_outcomes"}:
            continue
        paired = bool(experimental and comparator and experimental["entity_id"] != comparator["entity_id"])
        active_arm = experimental if paired else arm or experimental
        kind = ("arm_specific_result" if descriptive_arm and paired else
                "single_arm" if contrast == "single_arm" else
                "treatment_comparison" if contrast == "treatment_comparison" and experimental and comparator else
                contrast if contrast in {"biomarker_association", "prognostic", "interaction", "other"} else "unresolved_comparator")
        if not any(c["comparison_id"] == comparison_id for c in comparisons):
            label = active_arm["label"] if active_arm else None
            comparisons.append({"comparison_id": comparison_id, "kind": kind,
                "scope": {"record_kind": "canonical_review_scope", "report_id": report_id,
                          "population_id": local_population, "review_stage": stage,
                          "source_input_sha256": payload["source_sha256"], "review_binding_sha256": binding},
                "comparator_key": "reported-arm-" + digest(comparator["label"])[:20] if comparator else None,
                "comparator_label": comparator["label"] if comparator else None, "comparator_drug_ids": [],
                "intervention_drug_ids": [], "additional_intervention_drug_ids": [],
                "additional_intervention_ids": ["reported-arm-" + digest(label)[:20]] if label else [],
                "additional_intervention_label": label, "comparison_filter_eligible": scoped,
                "comparator_filter_eligible": bool(scoped and comparator), "result_ids": []})
            projected = comparisons[-1]
            projected["comparator_arm_id"] = comparator["entity_id"] if comparator else None
            projected["intervention_arm_id"] = active_arm["entity_id"] if active_arm else None
            projected["outcome_arm_id"] = descriptive_arm["entity_id"] if descriptive_arm else None
            projected["outcome_arm_label"] = descriptive_arm["label"] if descriptive_arm else None
            projected["result_relation"] = base["result_relation"]
            if descriptive_arm and descriptive_arm["entity_id"] in regimens:
                projected["outcome_native_regimen"] = deepcopy(regimens[descriptive_arm["entity_id"]])
            for side, own_arm in (("comparator", comparator), ("intervention", active_arm)):
                if own_arm and own_arm["entity_id"] in regimens:
                    projected[side + "_native_regimen"] = deepcopy(regimens[own_arm["entity_id"]])
            if directed:
                projected["directed_contrast"] = deepcopy(directed)
        comparison = next(c for c in comparisons if c["comparison_id"] == comparison_id)
        comparison["result_ids"].append(rid)
        comparison["comparison_filter_eligible"] |= scoped
        comparison["comparator_filter_eligible"] |= bool(scoped and comparator)
    return {"results": results, "samples": samples, "comparisons": comparisons, "evidence_registry": registry,
            "review": {"stage": stage, "reviewed_at": review["reviewed_at"],
                       "review_namespace": namespace,
                       "source_ref_sha256": digest(review["source_ref"]), "source_sha256": payload["source_sha256"],
                       "models": deepcopy(payload["models"]), "entities": deepcopy(payload["entities"]),
                       "facts": all_facts, "field_coverage": deepcopy(payload["field_coverage"]),
                       "limitations": deepcopy(payload["limitations"]),
                       **({"local_review": deepcopy(payload["local_review"]), "reviewer_model": payload["reviewer_model"], "is_native_response": False} if payload.get("local_review") else {}),
                       "arm_regimens": deepcopy(payload.get("arm_regimens", [])),
                       "contrast_definitions": deepcopy(payload.get("contrast_definitions", []))}}


def project_articles(articles):
    records, registry, seen = [], {}, set()
    for article in articles:
        citation = article["citation"]; pmid = str(citation["pmid"]); report_id = citation["report_id"]
        need(pmid.isascii() and pmid.isdigit() and pmid not in seen and re.fullmatch(r"report-[a-f0-9]{24}", report_id), "Unique canonical PMID/report identity required")
        seen.add(pmid)
        effective = article.get("R3") or article.get("R2")
        need(effective and effective["status"] in {"retain", "exclude", "unclear"}, "Effective article decision required")
        authors = citation.get("authors") or []
        first = authors[0] if isinstance(authors, list) and authors else authors if isinstance(authors, str) else ""
        surname = citation.get("first_author_surname") or (first.get("family") or first.get("last_name") or first.get("surname") if isinstance(first, dict) else str(first).replace(",", " ").split()[0] if str(first).strip() else "")
        record = {"pmid": pmid, "report_id": report_id, "title": citation["title"], "year": citation.get("year"),
                  "first_author_surname": surname, "doi": citation.get("doi"),
                  "current_screening_status": effective["status"], "current_main_eligible": effective["status"] == "retain" and not citation.get("publication_hold"),
                  "decision_reason": effective["reason"], "publication_hold": bool(citation.get("publication_hold")),
                  "quantitative_results": [], "sample_size_records": [], "comparisons": [], "reviews": []}
        for stage in ("R2", "R3"):
            review = article.get(stage)
            if not review: continue
            need(str(review.get("pmid", pmid)) == pmid and review.get("stage", stage) == stage, "Review/citation mismatch")
            graph = _graph(citation, stage, review)
            if not graph: continue
            record["quantitative_results"].extend(graph["results"])
            record["sample_size_records"].extend(graph["samples"])
            record["comparisons"].extend(graph["comparisons"])
            record["reviews"].append(graph["review"])
            need(not set(registry) & set(graph["evidence_registry"]), "Cross-artifact evidence collision")
            registry.update(graph["evidence_registry"])
        records.append(record)
    return {"schema_version": 1, "status": "ready", "record_kind": "canonical_clinical_evidence",
            "content_sha256": digest({"articles": records, "evidence_registry": registry}),
            "as_of": datetime.now(timezone.utc).isoformat(), "articles": records,
            "evidence_registry": registry, **{flag: False for flag in FLAGS}}


def materialize_regimens(payload):
    """Use the same regimen interpreter as filters and tables, once per export."""
    script = Path(__file__).resolve().with_name("regimen_projection.cjs")
    result = subprocess.run(["node", str(script)], input=json.dumps(payload, ensure_ascii=False),
                            text=True, capture_output=True, check=False, timeout=180)
    if result.returncode:
        raise ValueError("Structured regimen projection failed: " + result.stderr[-2000:])
    projected = json.loads(result.stdout)
    need(projected.get("record_kind") == payload["record_kind"] and
         len(projected.get("articles", [])) == len(payload["articles"]), "Regimen projection changed article membership")
    projected["content_sha256"] = digest({"articles": projected["articles"], "evidence_registry": projected["evidence_registry"]})
    return projected


def export_clinical_evidence(root, *, articles):
    """articles must be Registry(root).clinical_articles(), already source-validated."""
    payload = materialize_regimens(project_articles(articles))
    source_root = str(Path(__file__).resolve().parents[2] / 'src')
    if source_root not in sys.path:
        sys.path.insert(0, source_root)
    from metamelanoma.treatment_normalization import publication as treatment_publication
    public_bytes = (json.dumps(payload, ensure_ascii=False, sort_keys=True, indent=2, allow_nan=False) + '\n').encode()
    with writer_lock(root):
        with treatment_publication(root, payload, source_bytes=public_bytes, source_path=PUBLIC) as treatment_ref:
            atomic(root, PUBLIC, payload)
    return {"treatment_normalizations": treatment_ref, "status": "CLINICAL_EVIDENCE_EXPORTED", "article_count": len(payload["articles"]),
            "result_count": sum(len(a["quantitative_results"]) for a in payload["articles"]),
            "public": PUBLIC, "scientific_baseline_files_changed": False, "new_API_requests": 0}
