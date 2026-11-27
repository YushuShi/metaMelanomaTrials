"""Refresh public registry phase, study start and status fields for the phase comparison tab."""
import argparse
import json
from pathlib import Path
import re
import subprocess
from time import sleep
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT=Path(__file__).resolve().parents[2]


def fetch(ids):
    result={}
    ids=sorted(set(ids))
    for start in range(0,len(ids),30):
        batch=ids[start:start+30]
        args={'filter.ids':','.join(batch),'pageSize':100,'fields':'NCTId,Phase,StudyType,OverallStatus,StartDate,StartDateType,PrimaryCompletionDate,PrimaryCompletionDateType,CompletionDate,CompletionDateType,StatusVerifiedDate,LastUpdatePostDate'}
        url='https://clinicaltrials.gov/api/v2/studies?'+urlencode(args)
        for attempt in range(3):
            try:
                with urlopen(Request(url,headers={'Accept':'application/json','User-Agent':'metaMelanomaTrials registry publication lookup'}),timeout=40) as response:
                    studies=json.load(response)['studies']
                break
            except OSError:
                if attempt==2: raise
                sleep(2**attempt)
        for study in studies:
            protocol=study['protocolSection']; ident=protocol['identificationModule']['nctId']
            assert ident in batch
            detail=protocol['statusModule'];design=protocol['designModule']
            result[ident]={'phases':[int(p[-1]) for p in design.get('phases',[]) if re.fullmatch('PHASE[1-4]',p)],
                'status':detail.get('overallStatus'),'status_date':detail.get('statusVerifiedDate') or detail.get('lastUpdatePostDateStruct',{}).get('date'),
                'start':detail.get('startDateStruct',{}),'primary_completion':detail.get('primaryCompletionDateStruct',{}),'completion':detail.get('completionDateStruct',{}),
                'study_type':design.get('studyType'),'source_url':'https://clinicaltrials.gov/study/'+ident}
    return result


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('ids',type=Path,nargs='?',help='Optional JSON list of public NCT identifiers. By default read the current tab evidence.')
    args=parser.parse_args()
    ids=json.loads(args.ids.read_text() if args.ids else subprocess.check_output(['node',str(ROOT/'website/scripts/phase_comparison.cjs'),str(ROOT),'--registrations'],text=True))
    if not all(isinstance(i,str) and re.fullmatch(r'NCT\d{8}',i) for i in ids):raise ValueError('Expected public NCT accession numbers')
    result=fetch(ids)
    dst=ROOT/'website/config/phase_comparison_registry.json'
    tmp=dst.with_suffix('.tmp');tmp.write_text(json.dumps(result,sort_keys=True,separators=(',',':'))+'\n');tmp.replace(dst)
    print(f'Fetched {len(result)} of {len(ids)} registrations.')
