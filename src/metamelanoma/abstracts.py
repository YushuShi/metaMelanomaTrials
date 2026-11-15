"""Identity-bound publisher scientific abstracts, using the existing public client."""
from __future__ import annotations

from dataclasses import dataclass, field
from html.parser import HTMLParser
import json
import re
import urllib.parse

from .io import digest
from .sources import _read_ref, abstract_text, doi


class AbstractPending(ValueError):
    """A checked page does not establish an unambiguous scientific abstract."""


@dataclass
class Node:
    tag: str
    attrs: dict
    start: int
    content_start: int
    parent: "Node | None" = None
    end: int | None = None
    content_end: int | None = None
    closed: bool = False
    children: list = field(default_factory=list)


class Page(HTMLParser):
    VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}

    def __init__(self, markup):
        super().__init__(convert_charrefs=True)
        self.markup = markup
        self.lines = [0]
        self.lines.extend(m.end() for m in re.finditer("\n", markup))
        self.nodes = []
        self.stack = []

    def source_offset(self):
        line, column = self.getpos()
        return self.lines[line - 1] + column

    def handle_starttag(self, tag, attrs):
        start = self.source_offset()
        node = Node(tag.casefold(), {k.casefold(): v or "" for k, v in attrs}, start,
                    start + len(self.get_starttag_text()), self.stack[-1] if self.stack else None)
        if node.parent:
            node.parent.children.append(node)
        self.nodes.append(node)
        if tag in self.VOID:
            node.end = node.content_end = node.content_start
            node.closed = True
        else:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if self.stack and self.stack[-1].start == self.source_offset():
            node = self.stack.pop()
            node.end = node.content_end = node.content_start
            node.closed = True

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, -1, -1):
            if self.stack[index].tag == tag.casefold():
                node = self.stack[index]
                node.content_end = self.source_offset()
                end = self.markup.find(">", self.source_offset())
                node.end = end + 1 if end >= 0 else None
                node.closed = end >= 0
                del self.stack[index:]
                return


def _decode(raw, content_type):
    match = re.search(r"charset\s*=\s*[\"']?([\w-]+)", content_type or "", re.I)
    encoding = match.group(1) if match else "utf-8-sig"
    try:
        return raw.decode(encoding, errors="strict"), encoding
    except (LookupError, UnicodeError) as exc:
        raise AbstractPending("Publisher HTML character encoding is unresolved") from exc


def _plain(markup):
    return abstract_text(markup)


def _span(markup, start, end, kind, **extra):
    return {"kind": kind, "decoded_html_char_start": start, "decoded_html_char_end": end,
            "decoded_html_span_sha256": digest(markup[start:end].encode("utf-8")), **extra}


def _excluded(node):
    while node:
        labels = " ".join(node.attrs.get(k, "") for k in ("id", "class", "aria-label", "data-title"))
        if node.tag in {"aside", "nav", "footer"} or re.search(
                r"graphical|plain.language|author.summary|highlights?|related.article|recommended|references|bibliography|sidebar", labels, re.I):
            return True
        node = node.parent
    return False


def _abstract_container(node):
    if node.tag not in {"section", "div"} or _excluded(node):
        return False
    values = [node.attrs.get(k, "").strip().casefold() for k in ("id", "class", "itemprop", "role", "aria-label", "data-title")]
    tokens = set(" ".join(values).split())
    return bool(tokens & {"abstract", "abstract-content", "abstractcontent", "abstract-section", "abstractsection", "doc-abstract"})


def _foreign_article(node, citation):
    """Do not inherit the page identity inside an explicitly different article."""
    expected = {"doi": doi(citation.get("doi")), "pmid": str(citation["pmid"])}
    while node:
        if node.tag == "article":
            for attr in ("doi", "data-doi", "data-article-doi", "pmid", "data-pmid", "data-pubmed-id", "itemid"):
                value = node.attrs.get(attr, "").strip()
                if not value:
                    continue
                parsed = _identifier(("PMID:" if attr in {"pmid", "data-pmid", "data-pubmed-id"} else "") + value)
                if parsed and expected[parsed[0]] and parsed[1] != expected[parsed[0]]:
                    return True
                if not parsed and attr != "itemid":
                    return True
        node = node.parent
    return False


def _primary_context(node, citation):
    return not _excluded(node) and not _foreign_article(node, citation)


def _primary_span(nodes, start, end, citation):
    return not any(start <= node.start < end and not _primary_context(node, citation) for node in nodes)


def _json_articles(value, pointer=""):
    if isinstance(value, list):
        for i, item in enumerate(value):
            yield from _json_articles(item, pointer + "/" + str(i))
    elif isinstance(value, dict):
        types = value.get("@type", [])
        types = [types] if isinstance(types, str) else types
        if isinstance(types, list) and any(str(t).rstrip("/") in {
                "ScholarlyArticle", "https://schema.org/ScholarlyArticle", "http://schema.org/ScholarlyArticle"} for t in types):
            yield value, pointer
        # Never use cited/related ScholarlyArticles nested under citation lists.
        for key in ("@graph", "mainEntity"):
            if key in value:
                yield from _json_articles(value[key], pointer + "/" + key)


def _identifier(value):
    value = str(value or "").strip()
    if re.fullmatch(r"(?:PMID\s*:\s*)?\d+", value, re.I):
        return "pmid", re.sub(r"^PMID\s*:\s*", "", value, flags=re.I)
    match = re.fullmatch(r"https://pubmed\.ncbi\.nlm\.nih\.gov/(\d+)/?", value, re.I)
    if match:
        return "pmid", match.group(1)
    normalized = doi(value)
    if re.fullmatch(r"10\.\d{4,9}/\S+", normalized):
        return "doi", normalized
    return None


def _json_identifiers(article):
    values = article.get("identifier", [])
    values = list(values) if isinstance(values, list) else [values]
    values += [article.get("@id"), article.get("sameAs")]
    out = {"doi": set(), "pmid": set()}
    for value in values:
        if isinstance(value, dict):
            key = str(value.get("propertyID", "")).casefold()
            literal = value.get("value")
            if key in {"doi", "pmid", "pubmed"}:
                parsed = _identifier(("PMID:" if key in {"pmid", "pubmed"} else "") + str(literal or ""))
            else:
                parsed = None
        elif isinstance(value, str):
            parsed = _identifier(value)
        else:
            parsed = None
        if parsed:
            out[parsed[0]].add(parsed[1])
    return out


def _identity(found, citation):
    expected = {"doi": doi(citation.get("doi")), "pmid": str(citation["pmid"])}
    for key in ("doi", "pmid"):
        if found[key] and expected[key] and found[key] != {expected[key]}:
            raise AbstractPending("Publisher primary " + key.upper() + " metadata conflicts with the citation")
    return any(expected[key] and expected[key] in found[key] for key in expected)


def parse_publisher_abstract(raw: bytes, citation: dict, *, raw_ref: dict, content_type="") -> dict:
    """Pure HTML extraction. Provenance offsets index the strictly decoded HTML."""
    if not str(citation.get("pmid", "")).isascii() or not str(citation.get("pmid", "")).isdigit():
        raise AbstractPending("Exact citation PMID required")
    if not isinstance(raw, bytes) or digest(raw) != raw_ref.get("sha256") or raw_ref.get("bytes", len(raw)) != len(raw):
        raise AbstractPending("Publisher original HTML reference differs")
    if content_type and not re.search(r"(?:text/html|application/xhtml\+xml)", content_type, re.I):
        raise AbstractPending("DOI target is not a publisher HTML page")
    markup, encoding = _decode(raw, content_type)
    if not re.search(r"<(?:html|head|meta|article|section|div|script)\b", markup, re.I):
        raise AbstractPending("Publisher target has no scientific HTML structure")
    if re.search(r"verify you are human|checking your browser|access denied|robot check|just a moment|captcha", _plain(markup)[:2000], re.I):
        raise AbstractPending("Publisher page is blocked or an anti-bot challenge")
    page = Page(markup)
    try:
        page.feed(markup); page.close()
    except Exception as exc:
        raise AbstractPending("Publisher HTML could not be parsed") from exc
    found = {"doi": set(), "pmid": set()}
    primary_meta = []
    meta_candidates = []
    for node in page.nodes:
        if node.tag != "meta" or not _primary_context(node, citation): continue
        key = (node.attrs.get("name") or node.attrs.get("property") or "").casefold()
        value = node.attrs.get("content", "")
        if key in {"citation_doi", "prism.doi", "dc.identifier", "dc.identifier.doi", "citation_pmid", "pmid", "dc.identifier.pmid", "pubmed_id"}:
            parsed = _identifier(("PMID:" if key in {"citation_pmid", "pmid", "dc.identifier.pmid", "pubmed_id"} else "") + value)
            if parsed:
                found[parsed[0]].add(parsed[1])
                primary_meta.append(_span(markup, node.start, node.end, "primary_identifier_metadata", field=key, value=value))
        if key == "citation_abstract" and value.strip():
            meta_candidates.append((value, _span(markup, node.start, node.end, "citation_abstract_metadata", field=key)))
    verified = _identity(found, citation)
    meta_verified = verified
    json_nodes = []
    for node in page.nodes:
        if (node.tag != "script" or not _primary_context(node, citation)
                or node.attrs.get("type", "").split(";")[0].strip().casefold() != "application/ld+json"): continue
        if not node.closed:
            raise AbstractPending("Unclosed scientific JSON-LD block")
        try:
            structured = json.loads(markup[node.content_start:node.content_end])
        except (ValueError, TypeError) as exc:
            raise AbstractPending("Malformed scientific JSON-LD") from exc
        for article, pointer in _json_articles(structured):
            identifiers = _json_identifiers(article)
            try:
                matches = _identity(identifiers, citation)
            except AbstractPending:
                matches = False
            json_nodes.append((node, article, pointer, matches, identifiers))
    matching = [item for item in json_nodes if item[3]]
    if matching:
        verified = True
        if not meta_verified and any(any(item[4].values()) and not item[3] for item in json_nodes):
            raise AbstractPending("Ambiguous primary ScholarlyArticle identifiers")
        for node, article, pointer, _, identifiers in matching:
            primary_meta.append(_span(markup, node.content_start, node.content_end, "ScholarlyArticle_identifiers",
                                      json_pointer=pointer, identifiers={k: sorted(v) for k, v in identifiers.items()}))
    if not verified:
        raise AbstractPending("Exact primary DOI/PMID was not established in publisher metadata")
    candidates = list(meta_candidates)
    for node, article, pointer, matches, identifiers in json_nodes:
        if not matches and (any(identifiers.values()) or len(json_nodes) != 1): continue
        value = article.get("abstract")
        if isinstance(value, dict): value = value.get("@value")
        if isinstance(value, str) and value.strip():
            candidates.append((value, _span(markup, node.content_start, node.content_end, "ScholarlyArticle.abstract", json_pointer=pointer + "/abstract")))
    headings = [n for n in page.nodes if re.fullmatch(r"h[1-6]", n.tag) and n.closed and _primary_context(n, citation)]
    selected_containers = []
    for node in page.nodes:
        if _abstract_container(node) and _primary_context(node, citation):
            if not node.closed: raise AbstractPending("Abstract container has no clear closing boundary")
            start = node.content_start
            initial = next((h for h in headings if node.content_start <= h.start < node.content_end
                            and not _plain(markup[node.content_start:h.start])
                            and _plain(markup[h.content_start:h.content_end]).strip().casefold().rstrip(":") == "abstract"), None)
            if initial: start = initial.end
            boundaries = [h.start for h in headings if initial and initial.end <= h.start < node.content_end
                          and int(h.tag[1]) <= int(initial.tag[1])]
            end = boundaries[0] if boundaries else node.content_end
            if not _primary_span(page.nodes, start, end, citation):
                continue
            candidates.append((markup[start:end], _span(markup, start, end, "explicit_abstract_section")))
            selected_containers.append(node)
    for heading in headings:
        if _excluded(heading) or _plain(markup[heading.content_start:heading.content_end]).strip().casefold().rstrip(":") != "abstract": continue
        if any(node.start < heading.start < node.end for node in selected_containers): continue
        parent = heading.parent
        if parent is None or not parent.closed: continue
        following = [h for h in headings if heading.end <= h.start < parent.content_end and int(h.tag[1]) <= int(heading.tag[1])]
        end = following[0].start if following else parent.content_end if parent.tag == "section" else None
        if end is not None and _primary_span(page.nodes, heading.end, end, citation):
            candidates.append((markup[heading.end:end], _span(markup, heading.end, end, "bounded_Abstract_heading")))
    unique = {}
    for value, span in candidates:
        value = _plain(value)
        if not value: continue
        if re.search(r"no (?:scientific )?abstract|abstract (?:is )?(?:not available|unavailable)|read more|\.\.\.$|…$", value, re.I):
            raise AbstractPending("Marked abstract is unavailable or appears truncated")
        if len(value) < 30 or len(value.split()) < 5:
            raise AbstractPending("Marked abstract is too limited to establish scientific content")
        unique.setdefault(value, []).append(span)
    if len(unique) != 1:
        raise AbstractPending("No unambiguous explicitly marked scientific abstract" if not unique else "Conflicting marked scientific abstracts")
    abstract, spans = next(iter(unique.items()))
    return {"pmid": str(citation["pmid"]), "report_id": citation["report_id"], "abstract": abstract,
            "abstract_check_status": "recovered", "kind": "publisher_scientific_abstract", "source": dict(raw_ref),
            "identity": {"expected_doi": doi(citation.get("doi")), "expected_pmid": str(citation["pmid"]),
                         "primary_metadata": primary_meta},
            "abstract_provenance": {"raw_html": dict(raw_ref), "source_encoding": encoding,
                "text_sha256": digest(abstract.encode("utf-8")), "spans": spans,
                "derivation": "HTML entity decoding and visible scientific-abstract text; whitespace normalized"},
            "global_unavailability_established": False}


def recover_publisher_abstract(provider, citation: dict) -> dict:
    """One DOI-backed publisher route, using PublicSources.fetch and its receipts."""
    pending = {"pmid": str(citation["pmid"]), "report_id": citation["report_id"], "abstract": None,
               "abstract_check_status": "technical_pending", "kind": "publisher_scientific_abstract",
               "global_unavailability_established": False, "checks": []}
    identifier = doi(citation.get("doi"))
    if not re.fullmatch(r"10\.\d{4,9}/\S+", identifier):
        return {**pending, "reason": "No DOI-backed publisher route; primary PMID-to-publisher proof is still needed"}
    url = "https://doi.org/" + urllib.parse.quote(identifier, safe="/")
    try:
        result = provider.fetch(url, "publisher_landing", str(citation["pmid"]))
        saved = {k: v for k, v in result.items() if k != "body_bytes"}
        pending["checks"].append({"kind": "publisher_landing", "source_result": saved})
        if result.get("status") != 200 or result.get("error"):
            raise AbstractPending("Publisher landing retrieval did not succeed")
        raw = _read_ref(provider.root, result["body"])
        if raw != result.get("body_bytes"):
            raise AbstractPending("Publisher returned bytes differ from the preserved original")
        headers = {k.casefold(): v for k, v in result.get("headers", {}).items()}
        out = parse_publisher_abstract(raw, citation, raw_ref=result["body"], content_type=headers.get("content-type", ""))
        return {**out, "checks": pending["checks"]}
    except (AbstractPending, ValueError, KeyError, TypeError, OSError) as exc:
        return {**pending, "reason": str(exc)}
