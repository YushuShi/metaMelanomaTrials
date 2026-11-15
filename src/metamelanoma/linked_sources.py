"""Verify an existing identity-bound Word supplement; no fetch or source writes."""
from copy import deepcopy
from datetime import datetime
from html.parser import HTMLParser
from io import BytesIO
from pathlib import PurePosixPath
from zipfile import ZipFile
import hashlib, json, subprocess
from .io import evidence_path


def _read(root, ref):
    path = evidence_path(root, ref['path'])
    if not path.is_file() or path.stat().st_nlink != 1:raise ValueError('Owned single-link evidence required')
    raw = path.read_bytes()
    if (ref['sha256'] != hashlib.sha256(raw).hexdigest()
            or 'bytes' in ref and (type(ref['bytes']) is not int or ref['bytes'] != len(raw))):
        raise ValueError('Linked-source reference changed')
    return raw


class _Links(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True);self.head=False;self.article=0;self.meta={};self.links=[]
    def handle_starttag(self, tag, attrs):
        attrs=dict(attrs)
        if tag=='head':self.head=True
        if tag=='article':self.article+=1
        if self.head and tag=='meta' and attrs.get('name'):
            self.meta.setdefault(attrs['name'],[]).append(attrs.get('content',''))
        if self.article==1 and tag=='a' and attrs.get('data-ga-action')=='click_feat_suppl':self.links.append(attrs.get('href'))
    def handle_endtag(self, tag):
        if tag=='head':self.head=False
        if tag=='article':self.article-=1


def _receipt(root, request_ref, receipt_ref, raw_ref, url, pmid, kind):
    q=json.loads(_read(root,request_ref));r=json.loads(_read(root,receipt_ref));_read(root,raw_ref)
    if (q.get('url')!=url or r.get('url')!=url or r.get('final_url')!=url
            or q.get('identity')!=pmid or r.get('identity')!=pmid or q.get('kind')!=kind or r.get('kind')!=kind
            or r.get('error') is not None or r.get('body')!=raw_ref or r.get('redirects')!=[]):
        raise ValueError('Exact same-primary public receipt required')
    start=datetime.fromisoformat(q['requested_at']);end=datetime.fromisoformat(r['received_at'])
    if start.utcoffset() is None or end.utcoffset() is None or start>end:raise ValueError('Invalid source receipt timing')
    return q,r,start,end


def verify(root, doc, primary_document):
    """Return exact non-target supplement blocks after all local proofs pass."""
    before=deepcopy(primary_document);identity=primary_document['identity'];ids=identity['persistent_identifiers']
    pmid=primary_document['pmid'];report=primary_document['report_id'];pmcid=ids['pmcid'][0];doi=ids['doi'][0]
    if (doc.get('record_kind')!='proposed_identity_bound_linked_supplement_document'
            or doc.get('pmid')!=pmid or doc.get('report_id')!=report or doc.get('primary_identity')!=identity
            or doc.get('primary_raw_ref')!=primary_document['raw_ref'] or primary_document.get('main_full_text_verified') is not True
            or ids.get('pmid')!=[pmid] or len(ids['pmcid'])!=1 or len(ids['doi'])!=1
            or doc.get('is_main_article_document') is not False or doc.get('clinical_eligibility_inferred') is not False
            or doc.get('whole_source_coverage_complete') is not False or doc.get('new_numerical_facts')!=0):
        raise ValueError('Separate supplement and exact verified primary identity required')
    _read(root,doc['primary_raw_ref']);link=doc['main_link_proof'];main='https://pmc.ncbi.nlm.nih.gov/articles/'+pmcid+'/'
    href='/articles/instance/'+pmcid.removeprefix('PMC')+'/bin/'+doc['package_member']
    member=doc['package_member']
    if (PurePosixPath(member).name!=member or not member.endswith('.doc')
            or doc['main_href']!=href or link['literal_href']!=href or link['main_url']!=main):raise ValueError('Attachment is not owned by the same PMC article')
    _,mr,_,_= _receipt(root,link['request_ref'],link['receipt_ref'],link['main_html_ref'],main,pmid,'PMC_HTML_supplement_link_verification')
    h=_Links();h.feed(_read(root,link['main_html_ref']).decode('utf-8'));h.close()
    for name,value in [('citation_pmid',pmid),('citation_doi',doi),('citation_title',identity['title']),('citation_fulltext_html_url',main)]:
        if h.meta.get(name)!=[value] or link['persistent_metadata'].get(name)!=value:raise ValueError('Main HTML persistent identity mismatch')
    if mr.get('status')!=200 or href not in h.links:raise ValueError('Owned primary supplement link missing')
    failure=doc['primary_supplement_download_failure'];attachment='https://pmc.ncbi.nlm.nih.gov'+href
    _,fr,_,failed_at=_receipt(root,failure['request_ref'],failure['receipt_ref'],failure['response_ref'],attachment,pmid,'PMC_primary_linked_supplement')
    failed=_read(root,failure['response_ref']);ctype={k.lower():v for k,v in fr.get('headers',{}).items()}.get('content-type','')
    if fr.get('status')!=200 or 'html' not in ctype.lower() or b'<html' not in failed.lower():raise ValueError('Exact failed PMC HTML attachment response required')
    package_url='https://www.ebi.ac.uk/europepmc/webservices/rest/'+pmcid+'/supplementaryFiles'
    _,pr,package_at,_=_receipt(root,doc['package_request_ref'],doc['package_receipt_ref'],doc['package_ref'],package_url,pmid,'EPMC_supplement_after_recorded_same_article_PMC_download_failure')
    if pr.get('status')!=200 or failed_at>package_at:raise ValueError('EPMC package must follow the same-primary PMC failure')
    raw=_read(root,doc['raw_ref'])
    if not raw.startswith(bytes.fromhex('d0cf11e0a1b11ae1')) or len(raw)>10000000:raise ValueError('Bound legacy Word document required')
    with ZipFile(BytesIO(_read(root,doc['package_ref']))) as z:
        selected=[x for x in z.infolist() if x.filename==member]
        if len(selected)!=1 or selected[0].file_size!=len(raw) or z.read(selected[0])!=raw:raise ValueError('ZIP member differs from the exact linked DOC')
    if doc['package_member_sha256']!=hashlib.sha256(raw).hexdigest():raise ValueError('Package member hash differs')
    extracted=_read(root,doc['extracted_text_ref']);receipt=doc['text_extraction_receipt']
    if receipt.get('input_sha256')!=doc['raw_ref']['sha256'] or receipt.get('output_ref')!=doc['extracted_text_ref'] or receipt.get('converter')!='/usr/bin/textutil -convert txt':raise ValueError('Bound extraction receipt required')
    result=subprocess.run(['/usr/bin/textutil','-convert','txt','-encoding','UTF-8','-format','doc','-noload','-nostore','-stdout','-stdin'],input=raw,capture_output=True,check=True,timeout=30)
    if result.stdout!=extracted:raise ValueError('Fixed Word text extraction differs')
    text=extracted.decode('utf-8');seen=set()
    for block in doc['blocks']:
        element=block['source_element'];start=element['extracted_text_char_start'];end=element['extracted_text_char_end']
        if (type(start)is not int or type(end)is not int or not 0<=start<end<=len(text)
                or block['text']!=text[start:end] or block.get('is_target')is not False or block.get('document_role')!='supplement'
                or element['raw_ref']!=doc['raw_ref'] or element['extracted_text_ref']!=doc['extracted_text_ref']
                or block['source_id']!=report+':linked-supplement:'+doc['raw_ref']['sha256'][:16]
                or block['block_id']in seen):raise ValueError('Literal non-target supplement block provenance differs')
        cells=json.loads(_read(root,element['table_cells_ref']));rows=[[c.strip()for c in r.split('\x07')]for r in block['text'].strip('\x07 \n\r\t').split('\x07\x07')]
        if (cells['literal_table_text']!=block['text'] or cells['source_ref']!=doc['extracted_text_ref'] or cells['char_start']!=start or cells['char_end']!=end
                or cells['cells']!=rows or len(rows)!=cells['rows_including_header'] or any(len(r)!=cells['columns']for r in rows)):raise ValueError('Native Word row/cell geometry differs')
        seen.add(block['block_id'])
    if not seen or primary_document!=before:raise ValueError('No supplement block or primary document changed')
    return deepcopy(doc['blocks'])
