"""Verified public article sources, with PMC-first full-text retrieval and explicit gaps."""
from __future__ import annotations

from collections import defaultdict
import hashlib
import http.client
from html.parser import HTMLParser
import ipaddress
import json
from pathlib import Path
import re
import socket
import ssl
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

from .io import atomic_bytes, atomic_json, canonical, digest, now, owned, reference

XLINK = "{http://www.w3.org/1999/xlink}href"


class SourceCoverageGap(ValueError):
    """Correct article identity, but the supplied main text is incomplete."""


def doi(value) -> str:
    return re.sub(r"^https?://(?:dx\.)?doi\.org/|^doi:\s*", "", str(value or "").strip(), flags=re.I).casefold()


def text(node) -> str:
    return " ".join(" ".join(node.itertext()).split()) if node is not None else ""


def jats_article(body: bytes, citation: dict, *, require_body=True) -> tuple[ET.Element, dict]:
    root = ET.fromstring(body)
    articles = [root] if root.tag == "article" else root.findall("article")
    if len(articles) != 1:
        raise ValueError("Exactly one primary article is required")
    article = articles[0]
    ids = defaultdict(list)
    for node in article.findall("./front/article-meta/article-id"):
        ids[node.get("pub-id-type", "")].append(text(node))
    found_pmc = {("PMC" + v if v.isdigit() else v).split(".")[0].upper()
                 for key in ("pmc", "pmcid") for v in ids.get(key, [])}
    expected_pmc = str(citation.get("pmcid") or "").split(".")[0].upper()
    expected_version = str(citation.get('pmcid')or'').upper()
    if '.' in expected_version:
        versions = {('PMC'+v if v[:1].isdigit() else v).upper()
                    for key in ('pmc','pmcid','pmcid-ver') for v in ids.get(key,[])}
        if expected_version not in versions:raise ValueError('Exact requested PMC version is not verified')
    expected_pmid = str(citation["pmid"])
    expected_doi = doi(citation.get("doi"))
    if expected_pmc and found_pmc and expected_pmc not in found_pmc:
        raise ValueError("Full-text PMCID differs from its citation")
    if ids.get("pmid") and expected_pmid not in ids["pmid"]:
        raise ValueError("Full-text PMID differs from its citation")
    if expected_doi and ids.get("doi") and expected_doi not in {doi(v) for v in ids["doi"]}:
        raise ValueError("Full-text DOI differs; preserve publication versions")
    if not (expected_pmc and expected_pmc in found_pmc or expected_pmid in ids.get("pmid", [])
            or expected_doi and expected_doi in {doi(v) for v in ids.get("doi", [])}):
        raise ValueError("No persistent identifier verifies the primary article")
    body_text = text(article.find('body'))
    has_body = bool(body_text)
    if len(body_text) < 200 and re.search(r'full.?text|download|click here|PDF',body_text,re.I) and not re.search(r'patients?|methods|results|case (?:report|presentation)',body_text,re.I):
        has_body = False  # A link to a PDF is not the full article's body.
    if require_body and not has_body:
        raise SourceCoverageGap("Retrieved document contains no full article body")
    return article, {"persistent_identifiers":dict(ids),"title":text(article.find("./front/article-meta/title-group/article-title")),
                     "article_type":article.get("article-type"),"full_body_verified":has_body}


def document_from_jats(body: bytes, citation: dict, raw_ref: dict) -> dict:
    article, identity = jats_article(body, citation)
    source_id = citation["report_id"] + ":main:" + digest(body)[:16]
    blocks = []
    counter = 0
    planned = identity['article_type'] in {'study-protocol','protocol','registered-report-protocol'}

    def add(node, label: str = ""):
        nonlocal counter
        value = text(node)
        rendering = 'literal_element_text'
        if node is not None and node.tag == 'table-wrap':
            pieces = [text(node.find('label')), text(node.find('caption'))]
            for row in node.findall('.//tr'):
                pieces.append(' | '.join(text(cell) for cell in row if cell.tag in {'td', 'th'}))
            pieces += [text(foot) for foot in node.findall('./table-wrap-foot')]
            # Graphic-only tables remain visibly unavailable, never blank
            # tables silently certified as a complete clinical source.
            value = '\n'.join(p for p in pieces if p)
            rendering = 'complete_rows_cells_headers_footnotes'
            if any(cell.get('colspan') not in {None,'1'} or cell.get('rowspan') not in {None,'1'}
                   for cell in node.iter() if cell.tag in {'td','th'}):
                # The complete source element preserves ambiguous merged
                # column geometry; no missing cells or headers are inferred.
                value = ET.tostring(node,encoding='unicode')
                rendering = 'complete_serialized_source_element_with_merged_cells'
        if value:
            counter += 1
            role = 'main_article_table' if node.tag == 'table-wrap' else 'main_article_caption' if node.tag == 'fig' else 'main_article'
            blocks.append({"source_id":source_id,"block_id":f"b{counter:05d}","text":label + value,
                           "is_target":True,"document_role":role,"planned_only":planned,
                           'raw_element_sha256':digest(ET.tostring(node, encoding='utf-8')),
                           'rendering':rendering})

    add(article.find("./front/article-meta/title-group/article-title"))
    for abstract in article.findall("./front/article-meta/abstract"):
        add(abstract)

    def bare(value, origin, kind):
        if value and value.strip():
            literal = ET.Element('text-fragment'); literal.text = value
            add(literal)
            blocks[-1]['raw_element_sha256'] = digest(ET.tostring(origin,encoding='utf-8'))
            blocks[-1]['text_origin'] = kind

    def walk(node):
        bare(node.text, node, 'element_text')
        for child in node:
            if child.tag in {"table-wrap","fig","boxed-text"}:
                add(child)
            elif child.tag in {"p","title","list","preformat","disp-quote","verse-group","def-list"}:
                add(child, "")
            elif not list(child) and text(child):
                add(child)
            else:
                walk(child)
            bare(child.tail, child, 'element_tail')
    walk(article.find("body"))
    for appendix in article.findall('./back/app-group'):
        walk(appendix)
    supplement_hrefs = sorted({node.get(XLINK) or node.get("href") for material in article.findall(".//supplementary-material")
                               for node in material.iter() if node.get(XLINK) or node.get("href")})
    graphical_tables = [node for node in article.findall('.//table-wrap') if not node.findall('.//tr') and node.findall('.//graphic')]
    figures = article.findall('.//fig')
    limitations = (["Linked supplemental materials have not yet been reviewed: " + ", ".join(supplement_hrefs)] if supplement_hrefs else [])
    if graphical_tables: limitations.append(str(len(graphical_tables)) + ' graphic-only table(s) lack reviewed cell transcription.')
    if figures: limitations.append(str(len(figures)) + ' figure(s): captions included; image content is not transcribed.')
    return {"pmid":str(citation["pmid"]),"report_id":citation["report_id"],"source_sha256":digest(body),
            "identity":identity,"raw_ref":raw_ref,"blocks":blocks,"main_full_text_verified":True,
            "supplement_hrefs":supplement_hrefs,
            "limitations":limitations, 'whole_source_coverage_complete':False}


class PublicRedirect(urllib.request.HTTPRedirectHandler):
    max_redirections = 5
    max_repeats = 2
    def __init__(self, events=None):
        super().__init__(); self.events = events if events is not None else []
    def redirect_request(self, request, fp, code, message, headers, newurl):
        verify_public_url(newurl)
        self.events.append({'from':request.full_url,'status':code,'to':newurl,'as_of':now()})
        return super().redirect_request(request, fp, code, message, headers, newurl)


def verify_public_url(url: str) -> None:
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.port not in {None,443}:
        raise ValueError("Public scientific sources must use credential-free HTTPS")
    answers = socket.getaddrinfo(parsed.hostname,443,type=socket.SOCK_STREAM)
    if not answers: raise ValueError('Public source did not resolve')
    for answer in answers:
        if not ipaddress.ip_address(answer[4][0]).is_global:
            raise ValueError("A public source cannot resolve to a private address")


def _public_connection(address, timeout=None, source_address=None):
    host, port = address
    answers = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    if not answers or any(not ipaddress.ip_address(a[4][0]).is_global for a in answers):
        raise ValueError('Public connection cannot use private addresses')
    failure = None
    for family, kind, proto, _, target in answers:
        sock = socket.socket(family, kind, proto)
        try:
            sock.settimeout(timeout)
            if source_address: sock.bind(source_address)
            sock.connect(target)  # Already-checked numeric endpoint, no second DNS lookup.
            return sock
        except OSError as exc:
            failure = exc; sock.close()
    raise failure or OSError('Public connection failed')


class PublicHTTPSConnection(http.client.HTTPSConnection):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs); self._create_connection = _public_connection


class PublicHTTPS(urllib.request.HTTPSHandler):
    def https_open(self, request):
        return self.do_open(PublicHTTPSConnection, request, context=self._context)


def _read_ref(root, ref):
    if not isinstance(ref, dict) or not {'path','sha256'} <= ref.keys(): raise ValueError('Exact source reference required')
    path = owned(root, ref['path'])
    if any(p.casefold().endswith(('.env','.key','.pem','.p12','.pfx')) or 'recovery-key' in p.casefold() for p in path.parts):
        raise ValueError('Credentials cannot be source references')
    raw = path.read_bytes()
    if digest(raw) != ref['sha256'] or 'bytes' in ref and (type(ref['bytes']) is not int or ref['bytes'] != len(raw)):
        raise ValueError('Source reference hash/length changed')
    return raw


class CitationHTML(HTMLParser):
    def __init__(self):
        super().__init__(); self.meta = {}; self.parts = []; self.skip = 0
    def handle_starttag(self, tag, attrs):
        tag = tag.rsplit(':',1)[-1]
        attr = dict(attrs)
        if tag == "meta":
            self.meta[(attr.get("name") or attr.get("property") or "").casefold()] = attr.get("content", "")
        if tag in {"script","style"}: self.skip += 1
    def handle_endtag(self,tag):
        tag = tag.rsplit(':',1)[-1]
        if tag in {"script","style"}: self.skip = max(0,self.skip-1)
    def handle_data(self,data):
        if not self.skip:self.parts.append(data)


def abstract_text(markup):
    """Crossref often stores unbound jats: prefixes: parse as safe HTML text."""
    parser = CitationHTML(); parser.feed(str(markup or '')); parser.close()
    return ' '.join(' '.join(parser.parts).split())


def scientific_abstracts(article):
    values = []
    candidates = article.findall('./front/article-meta/abstract') + article.findall('./front/article-meta/trans-abstract')
    candidates += [sec for sec in article.findall('.//body//sec')
                   if sec.get('sec-type','').casefold()=='abstract' or text(sec.find('title')).casefold() in {'abstract','résumé'}]
    for node in candidates:
        kind = ' '.join([node.get('abstract-type',''),node.get('specific-use',''),text(node.find('title'))]).casefold().replace('_','-')
        if re.search(r'plain[ -]?language|graphical|author[ -]summary|editor|\btoc\b|highlight|significance|summary for patients',kind):
            continue
        value = text(node)
        if value: values.append(value)
    for node in article.findall('.//preformat'):
        literal=''.join(node.itertext())
        start=re.search(r'(?im)^[ \t]*(?:abstract|résumé)[ \t]*[:\-]?[ \t]*(?:\n|$)',literal)
        if start:
            end=re.search(r'(?im)^[ \t]*(?:\d+[. ]+)?(?:introduction|main text|case report|case presentation)\b',literal[start.end():])
            if end:
                value=literal[start.end():start.end()+end.start()].strip()
                if value:values.append(value)
    return list(dict.fromkeys(values))


def unresolved_abstract_location(article):
    # A body label/preformatted abstract whose boundary is not understood is
    # an availability gap, never proof that the scientific abstract is absent.
    for node in article.findall('.//body//title')+article.findall('.//body//p')+article.findall('.//preformat'):
        if re.search(r'(?im)^\s*(?:abstract|résumé)\b', ''.join(node.itertext())):
            return True
    return False


class PublicSources:
    def __init__(self, root: Path, *, timeout: int = 45, max_attempts: int = 3):
        if type(max_attempts) is not int or not 1 <= max_attempts <= 3 or not 0 < timeout <= 120:
            raise ValueError('Bounded public-source timeout/attempt count required')
        self.root = root.resolve(); self.timeout = timeout; self.max_attempts = max_attempts
        self._clock_lock = threading.Lock(); self._last = 0.0
        self.cached = {}
        audit = owned(self.root, "data/proposed_changes/unified_melanoma_pipeline/candidate_cached_main_source_checks.json")
        if audit.exists():
            self.cached = {str(r["pmid"]):r for r in json.loads(audit.read_bytes())["records"]}

    def fetch(self, url: str, kind: str, identity: str, *, force_refresh=False) -> dict:
        key = digest(canonical({"url":url,"kind":kind,"identity":identity}))[:24]
        base = owned(self.root, "data/sources/requests/" + key)
        index = owned(self.root, base / "last_success.json")
        if index.exists() and not force_refresh:
            saved = json.loads(index.read_bytes())
            if saved.get('url') != url or saved.get('kind') != kind or saved.get('identity') != identity or saved.get('status') != 200 or saved.get('error'):
                raise ValueError('Cached public request identity changed')
            body = _read_ref(self.root, saved['body'])
            return {**saved,"body_bytes":body,"cache_reused":True}
        failures = []
        for ordinal in range(1,self.max_attempts+1):
            with self._clock_lock:
                delay = max(0.0, 0.36-(time.monotonic()-self._last))
                if delay:time.sleep(delay)
                self._last = time.monotonic()
            folder = owned(self.root, base / (str(time.time_ns()) + "-" + str(ordinal)))
            folder.mkdir(parents=True,exist_ok=False)
            atomic_json(folder/"request.json",{"url":url,"kind":kind,"identity":identity,"requested_at":now(),"attempt":ordinal})
            status = None; headers = {}; body = b""; error = None; final_url = url; redirects = []
            try:
                verify_public_url(url)
                request = urllib.request.Request(url,headers={"User-Agent":"metaMelanomaTrials evidence synthesis","Accept":"application/xml,application/json,text/html,application/pdf"})
                with urllib.request.build_opener(urllib.request.ProxyHandler({}), PublicRedirect(redirects), PublicHTTPS(context=ssl.create_default_context())).open(request,timeout=self.timeout) as response:
                    status = response.status; final_url = response.url
                    verify_public_url(final_url)
                    headers = {k:v for k,v in response.headers.items() if k.casefold() in {"content-type","date","etag","retry-after"}}
                    body = response.read(25_000_001)
                    if len(body)>25_000_000:raise ValueError("Public source exceeds25MB; separate acquisition required")
            except urllib.error.HTTPError as exc:
                status = exc.code; headers = {"retry-after":exc.headers.get("Retry-After","")}
                try: body = exc.read(1_000_000)
                except http.client.IncompleteRead as partial: body = partial.partial
                error = str(exc)
            except http.client.IncompleteRead as exc:
                body = exc.partial; error = 'Incomplete HTTP body; partial original bytes preserved'
            except Exception as exc:
                error = type(exc).__name__ + ": " + str(exc)
            atomic_bytes(folder/"response.body",body)
            saved = {"status":status,"url":url,"final_url":final_url,"kind":kind,"identity":identity,"headers":headers,
                     "error":error,"received_at":now(),"body":reference(self.root,folder/"response.body")}
            saved.update(redirects=redirects,http_requests_including_redirects=1+len(redirects),maximum_redirects=5)
            atomic_json(folder/"receipt.json",saved)
            if status == 200 and not error:
                atomic_json(index,saved)
                return {**saved,"body_bytes":body,"cache_reused":False}
            failures.append(saved)
            if status is not None and status not in {408,429,500,502,503,504}:break
            if ordinal<self.max_attempts:
                hint = headers.get("Retry-After") or headers.get("retry-after") or "0"
                try:wait = max(float(hint),2**ordinal)
                except ValueError:wait = 2**ordinal
                if wait>120:break
                time.sleep(wait)
        return {"error":"Public retrieval failed after bounded retries","failures":failures,"status":status}

    def cached_main(self, citation: dict, *, persist=True) -> dict | None:
        row = self.cached.get(str(citation["pmid"]))
        if not row:return None
        for saved in row["documents"]:
            ref = saved["document"]
            if ref.get("project") != "metaOncoTrial":continue
            parent = self.root.parent / "metaOncoTrial"
            raw = _read_ref(parent, ref)
            receipt_ref = saved["receipt"]
            _read_ref(parent, receipt_ref)
            # Validate before materializing any active source copy.
            jats_article(raw, citation)
            if persist:
                path = owned(self.root,"data/sources/documents/"+digest(raw)+".xml")
                if not path.exists():atomic_bytes(path,raw)
                raw_ref = reference(self.root,path)
            else:
                raw_ref = dict(ref)
            document = document_from_jats(raw,citation,raw_ref)
            document["shared_source_provenance"] = {"document":ref,"receipt":receipt_ref}
            return document
        return None

    def resolve_pmcid(self, citation: dict) -> str | None:
        if citation.get("pmcid"):return citation["pmcid"]
        query = urllib.parse.urlencode({"ids":str(citation["pmid"]),"format":"json"})
        result = self.fetch("https://pmc.ncbi.nlm.nih.gov/tools/idconv/api/v1/articles/?"+query,"PMC_identifier",str(citation["pmid"]))
        if result.get("body_bytes"):
            data = json.loads(result['body_bytes'])
            if not isinstance(data,dict) or not isinstance(data.get('records'),list):raise ValueError('Invalid PMC identifier response')
            for record in data['records']:
                if not isinstance(record,dict):raise ValueError('Invalid PMC identifier record')
                if str(record.get("pmid")) == str(citation["pmid"]) and record.get("pmcid"):
                    return record["pmcid"]
        return None

    def fulltext(self, citation: dict) -> dict:
        failures = []
        try: cached = self.cached_main(citation)
        except SourceCoverageGap as exc:
            cached = None; failures.append({'provider':'shared_cache','problem':str(exc),'not_a_new_primary_fulltext_failure':True})
        except (ValueError,KeyError,TypeError,OSError,ET.ParseError) as exc:
            return {'pmid':str(citation['pmid']),'report_id':citation['report_id'],'main_full_text_verified':False,
                'source_status':'technical_pending','reason':'Cached source integrity/identity needs review: '+str(exc),
                'global_unavailability_established':False}
        if cached:return cached
        try: pmcid = self.resolve_pmcid(citation)
        except (ValueError,KeyError,TypeError,OSError) as exc:
            pmcid = None; failures.append({'provider':'PMC_identifier','problem':str(exc),'not_a_fulltext_failure':True})
        if pmcid:
            citation = {**citation,"pmcid":pmcid}
            primary = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?"+urllib.parse.urlencode({"db":"pmc","id":pmcid.removeprefix("PMC"),"retmode":"xml"})
            # Europe PMC is attempted only after this exact article's primary full-text request fails.
            for provider,url in [("PMC",primary),("Europe_PMC","https://www.ebi.ac.uk/europepmc/webservices/rest/"+pmcid+"/fullTextXML")]:
                result = self.fetch(url,provider+"_fulltext",str(citation["pmid"]))
                try:
                    if not result.get("body_bytes"):raise ValueError(result.get("error","No source body"))
                    document = document_from_jats(result["body_bytes"],citation,result["body"])
                    document["provider"] = provider; document["prior_primary_failures"] = failures
                    return document
                except (ValueError,ET.ParseError) as exc:
                    failures.append({"provider":provider,"problem":str(exc),"request_result":{k:v for k,v in result.items()if k!="body_bytes"}})
                if provider == "PMC":
                    # A front-only XML response does not establish that the
                    # primary PMC rendered article lacks its full main text.
                    from .pmc_html import document_from_pmc_html
                    html_result = self.fetch("https://pmc.ncbi.nlm.nih.gov/articles/"+pmcid+"/",
                                             "PMC_HTML_fulltext",str(citation["pmid"]))
                    try:
                        if not html_result.get("body_bytes"):
                            raise ValueError(html_result.get("error","No primary HTML body"))
                        xml_identity = None
                        if result.get("body_bytes"):
                            try: xml_identity = jats_article(result["body_bytes"],citation,require_body=False)[1]
                            except (ValueError,ET.ParseError): pass
                        document = document_from_pmc_html(html_result["body_bytes"],citation,
                                                         html_result["body"],xml_identity=xml_identity)
                        document["prior_primary_failures"] = failures
                        return document
                    except (ValueError,ET.ParseError) as exc:
                        failures.append({"provider":"PMC_HTML","problem":str(exc),
                            "request_result":{k:v for k,v in html_result.items()if k!="body_bytes"}})
        publisher = self.publisher_pdf(citation)
        if publisher.get("main_full_text_verified"):
            publisher["prior_primary_failures"] = failures
            return publisher
        return {"pmid":str(citation["pmid"]),"main_full_text_verified":False,"pmcid":pmcid,
                "reason":"No identity-verified full article retrieved; this is not proof of global unavailability.",
                "primary_failures":failures,"publisher":publisher}

    def publisher_pdf(self, citation: dict) -> dict:
        if not citation.get("doi"):return {"reason":"No publisher DOI is available"}
        result = self.fetch("https://doi.org/"+urllib.parse.quote(doi(citation["doi"]),safe="/"),"publisher_landing",str(citation["pmid"]))
        if not result.get("body_bytes"):return {"reason":"Publisher landing could not be retrieved","result":result}
        parser = CitationHTML(); parser.feed(result["body_bytes"].decode("utf-8",errors="replace"))
        known_doi = parser.meta.get("citation_doi") or parser.meta.get("dc.identifier") or parser.meta.get("prism.doi")
        if doi(known_doi)!=doi(citation["doi"]):return {"reason":"Publisher citation DOI was not verified","landing":result["body"]}
        url = parser.meta.get("citation_pdf_url")
        if not url:return {"reason":"Verified landing has no retrievable citation PDF link","landing":result["body"]}
        pdf = self.fetch(urllib.parse.urljoin(result["final_url"],url),"publisher_pdf",str(citation["pmid"]))
        if not pdf.get("body_bytes",b"").startswith(b"%PDF"):
            return {"reason":"Publisher PDF link did not return a PDF","landing":result["body"]}
        try:
            import io
            from pypdf import PdfReader
            pages = PdfReader(io.BytesIO(pdf["body_bytes"])).pages
            strings = [page.extract_text() or "" for page in pages]
            full = "\n".join(strings)
            first = strings[0] if strings else ''
            title_key = re.sub(r'\W+','',str(citation.get('title')or'')).casefold()
            first_key = re.sub(r'\W+','',first).casefold()
            printed_dois = re.findall(r'10\.\d{4,9}/[^\s<>"\']+', first, re.I)
            if (len(full)<4000 or not title_key or title_key not in first_key
                    or not printed_dois or doi(printed_dois[0].rstrip('.,;)')) != doi(citation['doi'])):
                raise ValueError("Full PDF body, first-page title and primary printed DOI could not all be verified")
            if not re.search(r"\b(methods|discussion|case report|case presentation)\b",full,re.I):
                raise ValueError("PDF may be an abstract rather than a full report")
            source_id = citation["report_id"]+":publisher-pdf:"+pdf["body"]["sha256"][:16]
            blocks = [{"source_id":source_id,"block_id":f"page-{i+1}","text":value,"is_target":True,
                       "document_role":"main_article_pdf","planned_only":False}for i,value in enumerate(strings)if value.strip()]
            return {"pmid":str(citation["pmid"]),"report_id":citation["report_id"],"source_sha256":pdf["body"]["sha256"],
                    "main_full_text_verified":True,"blocks":blocks,"raw_ref":pdf["body"],"provider":"publisher_pdf",
                    "identity":{"DOI":doi(citation["doi"]),"landing":result["body"]},
                    "limitations":["PDF reading-order/table layout may require source review; supplemental files are not yet reviewed."]}
        except Exception as exc:
            return {"reason":"PDF remains unverified: "+str(exc),"raw_ref":pdf["body"]}

    def recover_abstracts(self, citations: list[dict]) -> dict[str,dict]:
        """Bounded checked-source findings, never a claim of global absence."""
        if not citations:return {}
        records = {str(c['pmid']): {'abstract':None, 'abstract_check_status':'technical_pending', 'checks':[]} for c in citations}
        def check(pmid, kind, state, result=None, reason=None):
            item = {'kind':kind, 'status':state}
            if result is not None:item['source_result'] = {k:v for k,v in result.items()if k!='body_bytes'}
            if reason:item['reason'] = reason
            records[pmid]['checks'].append(item)
        def found(pmid, value, result, kind):
            records[pmid].update(abstract=value, source=result['body'], kind=kind, abstract_check_status='recovered')
        ids = ','.join(records)
        url = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?' + urllib.parse.urlencode({'db':'pubmed','id':ids,'retmode':'xml'})
        pubmed = {}
        try:
            pubmed = self.fetch(url,'PubMed_abstract_check','batch')
            document = ET.fromstring(pubmed.get('body_bytes',b''))
            if document.tag != 'PubmedArticleSet':raise ValueError('Unexpected PubMed XML root')
            articles = defaultdict(list)
            for article in document.findall('PubmedArticle'):
                articles[text(article.find('./MedlineCitation/PMID'))].append(article)
            for pmid in records:
                if len(articles[pmid]) != 1:
                    check(pmid,'PubMed_abstract','technical_error',pubmed,'Exact requested PMID missing or duplicated');continue
                article=articles[pmid][0];parts=[]
                containers=article.findall('./MedlineCitation/Article/Abstract')+article.findall('./MedlineCitation/OtherAbstract')
                for container in containers:
                    label=(container.get('Type','')+' '+container.get('abstract-type','')).casefold()
                    if re.search('plain.?language|graphical|author.?summary|editor',label):continue
                    for node in container.findall('AbstractText'):
                        if re.search('plain.?language',node.get('Label',''),re.I):continue
                        value=text(node)
                        if value:parts.append((node.get('Label','')+': 'if node.get('Label')else'')+value)
                if parts:
                    found(pmid,'\n'.join(parts),pubmed,'PubMed_abstract')
                    check(pmid,'PubMed_abstract','scientific_abstract_present',pubmed)
                else:check(pmid,'PubMed_abstract','absent_in_verified_citation',pubmed)
        except (ValueError,KeyError,TypeError,OSError,ET.ParseError)as exc:
            for pmid in records:check(pmid,'PubMed_abstract','technical_error',pubmed,str(exc))
        for citation in citations:
            pmid=str(citation['pmid'])
            if records[pmid]['abstract'] is not None:continue
            complete_main_absence=False
            if citation.get('pmcid'):
                pmcid=str(citation['pmcid'])
                url='https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?'+urllib.parse.urlencode({'db':'pmc','id':pmcid.removeprefix('PMC'),'retmode':'xml'})
                main = {}
                try:
                    main=self.fetch(url,'PMC_abstract_check',pmid)
                    article,identity=jats_article(main.get('body_bytes',b''),citation,require_body=False)
                    parts=scientific_abstracts(article)
                    if parts:
                        found(pmid,'\n'.join(parts),main,'PMC_abstract');check(pmid,'PMC_abstract','scientific_abstract_present',main);continue
                    complete_main_absence=identity['full_body_verified'] and not unresolved_abstract_location(article)
                    check(pmid,'PMC_abstract','absent_in_verified_full_main'if complete_main_absence else'absence_not_proven_without_full_main',main)
                except (ValueError,KeyError,TypeError,OSError,ET.ParseError)as exc:
                    check(pmid,'PMC_abstract','technical_error',main,str(exc))
            if citation.get('doi'):
                crossref = {}
                try:
                    crossref=self.fetch('https://api.crossref.org/works/'+urllib.parse.quote(doi(citation['doi']),safe=''),'publisher_deposited_abstract',pmid)
                    message=json.loads(crossref.get('body_bytes',b''))['message']
                    if not isinstance(message,dict):raise ValueError('Invalid Crossref citation object')
                    if doi(message.get('DOI'))!=doi(citation['doi']):raise ValueError('Crossref DOI differs')
                    value=abstract_text(message.get('abstract',''))
                    if value and not re.match('plain.?language summary',value,re.I):
                        found(pmid,value,crossref,'publisher_deposited_abstract');check(pmid,'Crossref_abstract','scientific_abstract_present',crossref);continue
                    check(pmid,'Crossref_abstract','absent_from_publisher_deposit',crossref)
                except (ValueError,KeyError,TypeError,OSError)as exc:
                    check(pmid,'Crossref_abstract','technical_error',crossref,str(exc))
            technical=any(c['status']=='technical_error'for c in records[pmid]['checks'])
            if complete_main_absence and not technical:
                records[pmid].update(abstract_check_status='verified_absent_in_checked_sources',
                    reason='Identity-verified complete PMC main and checked citation sources contain no scientific abstract; this finding is limited to those sources.')
            else:
                # Primary publisher recovery is a bounded follow-up for still
                # unresolved records, not a claim that Crossref deposit absence
                # proves publisher absence. Lazy import keeps the parser/client
                # dependency acyclic; both helpers preserve original receipts.
                from .abstracts import recover_publisher_abstract
                publisher=recover_publisher_abstract(self,citation)
                recovered=publisher.get('abstract_check_status')=='recovered'and bool(publisher.get('abstract'))
                publisher_checks=publisher.get('checks')or[{'kind':'publisher_primary_abstract','reason':publisher.get('reason')}]
                records[pmid]['checks'].extend({**item,'status':'scientific_abstract_present'if recovered else'technical_pending'}for item in publisher_checks)
                records[pmid].update({k:v for k,v in publisher.items()if k!='checks'})
                if not recovered:
                    records[pmid].update(abstract_check_status='technical_pending',
                        reason='Scientific abstract availability remains unverified after checked citation/PMC/deposit and publisher follow-up. '+publisher.get('reason','No complete primary-main absence proof.'))
        return records
