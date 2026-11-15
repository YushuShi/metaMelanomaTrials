"""Identity-bound primary PMC HTML main text; isolated, not activated.

HTML is a source representation, never proof of clinical eligibility. Exact
source HTML and byte/character intervals accompany every retained block.
"""
from __future__ import annotations

from html import unescape
import re
import unicodedata
from urllib.parse import urlsplit

from .abstracts import Page
from .io import digest
from .sources import SourceCoverageGap, abstract_text, doi


class CompletePage(Page):
    """Reject truncated or ambiguously nested scientific source elements."""
    CRITICAL = {"html", "head", "body", "main", "article", "section", "div",
                "p", "table", "thead", "tbody", "tfoot", "tr", "th", "td",
                "caption", "figure", "figcaption", "ul", "ol", "li", "pre"}

    def __init__(self, markup):
        super().__init__(markup)
        self.errors = []

    def handle_starttag(self, tag, attrs):
        names = [k.casefold() for k, _ in attrs]
        if len(names) != len(set(names)):
            self.errors.append("Duplicate HTML attribute")
        super().handle_starttag(tag, attrs)

    def handle_endtag(self, tag):
        matching = [i for i, n in enumerate(self.stack) if n.tag == tag.casefold()]
        if matching and any(n.tag in self.CRITICAL for n in self.stack[matching[-1] + 1:]):
            self.errors.append("Misnested scientific HTML element")
        super().handle_endtag(tag)


def _title(value):
    value = unicodedata.normalize('NFKC', unescape(value or ''))
    value = value.translate(str.maketrans({c: '-' for c in '\u2010\u2011\u2012\u2013\u2014\u2212'}))
    value = re.sub(r'\[\s*(\d+)\s*([A-Za-z])\s*\]', r'[\1\2]', value)
    value = re.sub(r'\s*-\s*', '-', value)
    return " ".join(value.split()).rstrip(" .").casefold()


def _within(node, parent):
    return parent.start <= node.start and node.end is not None and node.end <= parent.end


def _pmcid_url(value):
    u = urlsplit(value)
    match = re.fullmatch(r"/articles/(PMC\d+(?:\.\d+)?)/?", u.path)
    if (u.scheme != "https" or u.hostname != "pmc.ncbi.nlm.nih.gov" or
            u.port not in {None, 443} or u.username or u.password or u.query or u.fragment or not match):
        raise ValueError("Exact primary PMC canonical article URL required")
    return match.group(1)


def document_from_pmc_html(body: bytes, citation: dict, raw_ref: dict, *, xml_identity=None):
    """Return verified source blocks, with full tables; no network or writes.

    The caller uses the existing public HTTPS/redirect/receipt implementation.
    A verified front-only XML identity may supply the article-type label only.
    Unsupported HTML structures remain explicit source gaps, not unavailable
    articles or clinical eligibility decisions.
    """
    if not isinstance(body, bytes) or not body or len(body) > 25_000_000:
        raise ValueError("Bounded complete original HTML bytes required")
    if (raw_ref.get("sha256") != digest(body) or
            ("bytes" in raw_ref and (type(raw_ref["bytes"]) is not int or raw_ref["bytes"] != len(body)))):
        raise ValueError("Original HTML reference does not bind these bytes")
    try:
        markup = body.decode("utf-8-sig", errors="strict")
    except UnicodeError as exc:
        raise ValueError("Primary PMC HTML encoding is unresolved") from exc
    # A BOM must remain represented in raw byte offsets.
    bom = 3 if body.startswith(b"\xef\xbb\xbf") else 0
    page = CompletePage(markup)
    page.feed(markup)
    page.close()
    if page.errors or any(not n.closed for n in page.nodes if n.tag in page.CRITICAL):
        raise SourceCoverageGap("Incomplete or misnested primary PMC HTML")
    heads = [n for n in page.nodes if n.tag == "head"]
    documents = [n for n in page.nodes if n.tag == "html"]
    bodies = [n for n in page.nodes if n.tag == "body"]
    if len(heads) != 1 or len(documents) != 1 or len(bodies) != 1:
        raise SourceCoverageGap("One complete primary HTML document required")
    if not _within(heads[0], documents[0]) or not _within(bodies[0], documents[0]):
        raise SourceCoverageGap("Head and body must belong to the complete HTML document")
    head = heads[0]
    head_nodes = [n for n in page.nodes if _within(n, head)]

    def meta(name):
        values = {n.attrs.get("content", "").strip() for n in head_nodes
                  if n.tag == "meta" and n.attrs.get("name", "").casefold() == name}
        if len(values) != 1 or not next(iter(values), ""):
            raise ValueError("Exact unambiguous head " + name + " required")
        return values.pop()

    pmid = str(citation["pmid"])
    if meta("citation_pmid") != pmid:
        raise ValueError("Primary PMC HTML PMID differs from its citation")
    page_doi = doi(meta("citation_doi"))
    if citation.get("doi") and page_doi != doi(citation["doi"]):
        raise ValueError("Primary PMC HTML DOI differs from its citation")
    page_title = meta("citation_title")
    if not _title(citation.get("title")) or _title(page_title) != _title(citation["title"]):
        raise ValueError("Primary PMC HTML title differs from its citation")
    canonical = [n.attrs.get("href", "") for n in head_nodes if n.tag == "link"
                 and "canonical" in n.attrs.get("rel", "").casefold().split()]
    if len(set(canonical)) != 1:
        raise ValueError("Exact primary PMC canonical identity required")
    pmcid = _pmcid_url(canonical[0])
    if not citation.get("pmcid") or pmcid != str(citation["pmcid"]).upper():
        raise ValueError("Primary PMC HTML PMCID/version differs from its citation")
    for n in head_nodes:
        if n.tag == "meta" and n.attrs.get("name", "").casefold() in {
                "citation_fulltext_html_url", "citation_abstract_html_url"}:
            if _pmcid_url(n.attrs.get("content", "")) != pmcid:
                raise ValueError("Conflicting primary PMC HTML identity")

    mains = [n for n in page.nodes if n.tag in {"section", "div"}
             and "main-article-body" in n.attrs.get("class", "").split()]
    if len(mains) != 1:
        raise SourceCoverageGap("One explicit primary main-article-body required")
    main = mains[0]
    ancestors = []
    parent = main.parent
    while parent:
        ancestors.append(parent)
        parent = parent.parent
    articles = [n for n in ancestors if n.tag == "article"]
    if len(articles) != 1 or not any(n.tag == "main" for n in ancestors):
        raise SourceCoverageGap("Main scientific body is outside its primary article")
    article = articles[0]
    if not _within(article, bodies[0]):
        raise SourceCoverageGap("Primary article must belong to the HTML body")
    for key in ("doi", "data-doi", "data-article-doi"):
        if article.attrs.get(key) and doi(article.attrs[key]) != page_doi:
            raise ValueError("Enclosing article DOI conflicts with primary head identity")
    for key in ("pmid", "data-pmid", "data-pubmed-id"):
        if article.attrs.get(key) and article.attrs[key].strip() != pmid:
            raise ValueError("Enclosing article PMID conflicts with primary head identity")
    for key in ("pmcid", "data-pmcid"):
        if article.attrs.get(key) and article.attrs[key].upper() != pmcid:
            raise ValueError("Enclosing article PMCID conflicts with primary head identity")
    if any(not n.closed for n in page.nodes if article.start <= n.start < article.end):
        raise SourceCoverageGap("Unclosed element inside the primary article")
    titles = [n for n in page.nodes if n.tag == "h1" and _within(n, article)]
    heading_matches = False
    if len(titles) == 1:
        heading = titles[0]
        heading_text = abstract_text(markup[heading.start:heading.end])
        heading_matches = _title(heading_text) == _title(page_title)
        # PMC may render a title and its subtitle as the sole H1 and P in
        # one HGROUP. Require the complete combined title, never H1 alone.
        group = heading.parent
        if not heading_matches and group and group.tag == 'hgroup' and _within(group, article):
            children = group.children
            subtitles = [n for n in children if n.tag == 'p']
            if (len(children) == 2 and heading in children and len(subtitles) == 1
                    and all(n.closed for n in children) and group.closed):
                subtitle = abstract_text(markup[subtitles[0].start:subtitles[0].end])
                heading_matches = bool(subtitle) and _title(heading_text + ': ' + subtitle) == _title(page_title)
    if not heading_matches:
        raise ValueError("Primary article heading does not verify its head title")

    def excluded(n):
        cur = n
        while cur:
            labels = " ".join(cur.attrs.get(k, "") for k in ("id", "class", "role", "aria-label"))
            if (cur.tag in {"nav", "aside", "footer", "script", "style", "button"} or
                    cur.tag == "article" and cur is not article or
                    "hidden" in cur.attrs or cur.attrs.get("aria-hidden", "").casefold() == "true" or
                    re.search(r"(?:^|[\s_-])(?:ref-list|references|bibliography|related|recommended|sidebar|front-matter)(?:$|[\s_-])", labels, re.I)):
                return True
            if cur.tag in {"section", "div"}:
                heading = next((c for c in cur.children if c.tag in {"h1", "h2", "h3", "h4"}), None)
                if heading and abstract_text(markup[heading.start:heading.end]).casefold() in {"references", "bibliography", "related articles", "recommended articles"}:
                    return True
            if cur is main:
                break
            cur = cur.parent
        return False

    if any(excluded(n) for n in ancestors):
        raise SourceCoverageGap("Main body is in a non-primary article region")
    local = [n for n in page.nodes if _within(n, main) and not excluded(n)]

    def render(n):
        omissions = [x for x in page.nodes if _within(x, n) and x is not n and excluded(x)]
        parts = []
        cursor = n.start
        for x in sorted(omissions, key=lambda x: (x.start, -x.end)):
            if x.start >= cursor:
                parts.append(markup[cursor:x.start])
                cursor = x.end
        parts.append(markup[cursor:n.end])
        return abstract_text("".join(parts))

    def is_abstract(n):
        return "abstract" in n.attrs.get("class", "").split() or n.attrs.get("id", "").casefold().startswith("abstract")

    def in_abstract(n):
        while n and n is not main:
            if is_abstract(n):
                return True
            n = n.parent
        return False

    prose = [n for n in local if n.tag == "p" and not in_abstract(n)
             and not any(p.tag in {"table", "td", "th", "figure", "figcaption"}
                         or "tw" in p.attrs.get("class", "").split()
                         or "table-wrap" in p.attrs.get("class", "").split()
                         for p in _parents(n, main))]
    if len(prose) < 2 or sum(len(render(n)) for n in prose) < 400:
        raise SourceCoverageGap("Abstract/table/navigation shell is not a full main text")

    source_id = citation["report_id"] + ":main-html:" + digest(body)[:16]
    planned = (xml_identity or {}).get("article_type") in {"study-protocol", "protocol", "registered-report-protocol"}
    blocks, limitations, table_ids = [], [], set()

    def span(n, start=None, end=None):
        a, b = n.start if start is None else start, n.end if end is None else end
        raw = markup[a:b].encode("utf-8")
        return {"raw_ref": dict(raw_ref), "decoded_HTML_char_start": a, "decoded_HTML_char_end": b,
                "raw_HTML_byte_start": bom + len(markup[:a].encode("utf-8")),
                "raw_HTML_byte_end": bom + len(markup[:b].encode("utf-8")),
                "raw_HTML_span_sha256": digest(raw), "element_tag": n.tag, "element_id": n.attrs.get("id")}

    def add(n, value, role="main_article", rendering="literal_HTML_element_text", target=True, extra=None):
        if value.strip():
            blocks.append({"source_id": source_id, "block_id": f"b{len(blocks)+1:05d}", "text": value,
                           "is_target": target, "document_role": role, "planned_only": planned,
                           "rendering": rendering, "raw_element_sha256": span(n)["raw_HTML_span_sha256"],
                           "source_element": span(n), **(extra or {})})

    def table(n):
        if any(excluded(x) for x in page.nodes if _within(x, n)):
            raise SourceCoverageGap("Main table contains a non-primary source region")
        descendants = [x for x in local if _within(x, n)]
        tables = [x for x in descendants if x.tag == "table"]
        images = [x for x in descendants if x.tag == "img"]
        if not tables and not images:
            raise SourceCoverageGap("Main table wrapper lacks rows or a graphic-only source")
        if n.attrs.get("id"):
            table_ids.add(n.attrs["id"])
        geometries = []
        for t in tables:
            rows = [x for x in descendants if x.tag == "tr" and _within(x, t)]
            cells = [x for x in descendants if x.tag in {"th", "td"} and _within(x, t)]
            if not rows or not cells:
                raise SourceCoverageGap("Main table source has no complete row/cell structure")
            geometries.append({"table_source": span(t), "row_count": len(rows), "cell_count": len(cells),
                               "cells": [{"source": span(x), "tag": x.tag, "rowspan": x.attrs.get("rowspan", "1"),
                                          "colspan": x.attrs.get("colspan", "1")} for x in cells]})
        if not tables:
            limitations.append("Graphic-only main table lacks reviewed cell transcription: " + (n.attrs.get("id") or "unnamed"))
        add(n, markup[n.start:n.end], "main_article_table", "complete_source_HTML_table_wrapper",
            extra={"table_geometry": geometries, "graphic_only_table": not bool(tables)})

    def table_wrapper(n):
        return n.tag in {"section", "div", "figure"} and ("tw" in n.attrs.get("class", "").split()
                or "table-wrap" in n.attrs.get("class", "").split()
                or bool(re.fullmatch(r"(?:tbl|table)\d+[\w.-]*", n.attrs.get("id", ""), re.I)))

    add(titles[0], render(titles[0]), "citation", target=False)
    atomic = {"p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "dl", "pre", "blockquote"}

    def walk(n):
        if excluded(n):
            return
        if is_abstract(n):
            add(n, render(n), "citation", target=False)
            return
        if table_wrapper(n) or n.tag == "table":
            table(n)
            return
        if n.tag in {"figure", "figcaption"} or "fig" in n.attrs.get("class", "").split():
            add(n, render(n), "main_article_caption")
            if any(x.tag == "img" and _within(x, n) for x in local):
                limitations.append("Figure captions included; image content is not transcribed: " + (n.attrs.get("id") or "unnamed"))
            return
        # A blockquote/list can contain a real table. Descend in that case
        # rather than flattening away its source geometry.
        if n.tag in atomic and not any(x.tag == "table" and x is not n and _within(x, n) for x in local):
            add(n, render(n))
            return
        cursor = n.content_start
        for child in n.children:
            bare = abstract_text(markup[cursor:child.start])
            if bare:
                add(n, bare, extra={"text_origin": "direct_container_text", "literal_source_subspan": span(n, cursor, child.start)})
            walk(child)
            cursor = child.end
        bare = abstract_text(markup[cursor:n.content_end])
        if bare:
            add(n, bare, extra={"text_origin": "direct_container_tail", "literal_source_subspan": span(n, cursor, n.content_end)})

    walk(main)
    for n in local:
        if n.tag == "table" and not in_abstract(n):
            if not any(b["document_role"] == "main_article_table" and
                       b["source_element"]["decoded_HTML_char_start"] <= n.start and
                       n.end <= b["source_element"]["decoded_HTML_char_end"] for b in blocks):
                raise SourceCoverageGap("A visible main table lacks its complete source/geometry block")
    for n in local:
        if n.tag == "a" and n.attrs.get("href", "").startswith("#") and re.search(r"\bTable\s*\d", render(n), re.I):
            if n.attrs["href"][1:] not in table_ids:
                raise SourceCoverageGap("A cited main table has no complete local table wrapper")
    supplements = sorted({n.attrs["href"] for n in local if n.tag == "a" and n.attrs.get("href")
                          and re.search(r"supplement|supporting information", render(n), re.I)})
    if supplements:
        limitations.append("Linked supplemental material is not reviewed: " + ", ".join(supplements))
    return {"pmid": pmid, "report_id": citation["report_id"], "source_sha256": digest(body),
            "raw_ref": dict(raw_ref), "provider": "PMC_HTML", "main_full_text_verified": True,
            "identity": {"persistent_identifiers": {"pmid": [pmid], "pmcid": [pmcid], "doi": [page_doi]},
                         "title": page_title, "article_type": (xml_identity or {}).get("article_type"),
                         "full_body_verified": True, "canonical_URL": canonical[0], "representation": "primary_PMC_HTML"},
            "blocks": blocks, "supplement_hrefs": supplements, "limitations": limitations,
            "whole_source_coverage_complete": False, "clinical_eligibility_inferred": False}


def _parents(node, stop):
    while node.parent and node.parent is not stop:
        node = node.parent
        yield node
