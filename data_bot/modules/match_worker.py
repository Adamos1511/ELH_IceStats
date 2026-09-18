"""ELH Match Center worker. Run: python -m data_bot.modules.match_worker.
Only this process contacts Hokej.cz. Public clients have read-only DB access.
"""
from __future__ import annotations
import argparse, copy, csv, io, json, logging, os, re, time, uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo
import requests
from bs4 import BeautifulSoup
from . import hokej_games as games

LOG = logging.getLogger('elh.live')
UTC = timezone.utc
PRAGUE = ZoneInfo('Europe/Prague')
ROOT = Path(__file__).resolve().parents[2]
SEASON = int(os.environ.get('ELH_SEASON', '2026'))
COMPETITION = os.environ.get('ELH_COMPETITION', '7562')
SCHEDULE_URL = ('https://www.hokej.cz/tipsport-extraliga/zapasy?matchList-view-displayAll=1'
                f'&matchList-filter-season={SEASON}&matchList-filter-competition={COMPETITION}')
TABLE_URL = ('https://www.hokej.cz/tipsport-extraliga/table?'
             f'table-filter-season={SEASON}&table-filter-competition={COMPETITION}')

def utcnow(): return datetime.now(UTC)
def iso(dt): return dt.astimezone(UTC).isoformat(timespec='seconds')
def parse_time(value):
    try: return datetime.fromisoformat(value.replace('Z', '+00:00')).astimezone(UTC)
    except (ValueError, AttributeError): return None

def number(value):
    try: return float(str(value).replace(',', '.').strip())
    except (ValueError, TypeError): return None

def fetch_text(url):
    r=requests.get(url, headers=games.HEADERS, timeout=(5,20));r.raise_for_status();return r.text

def parse_standings(html):
    result={'total':{}, 'home':{}, 'away':{}}
    for table in BeautifulSoup(html,'html.parser').select('table.table-soupiska'):
        heading=table.find_previous(['h1','h2','h3'])
        title=heading.get_text(' ',strip=True).upper() if heading else ''
        side='home' if 'DOMA' in title else 'away' if 'VENKU' in title else 'total'
        labels=[c.get_text(' ',strip=True) for c in table.select('thead th')]
        for tr in table.select('tbody tr'):
            cells=[c.get_text(' ',strip=True) for c in tr.find_all('td',recursive=False)]
            row=dict(zip(labels,cells));code=games._team_code_from_name(row.get('Tým',''))
            if not code or 'Z' not in row: continue
            score=re.fullmatch(r'(\d+):(\d+)',row.get('Skóre',''))
            gp=number(row['Z']);pp=number(row.get('Př'));pk=number(row.get('Os'))
            result[side][code]={'gp':gp,'rank':number(row.get('#')),'points':number(row.get('B')),
                'wins':number(row.get('V')),'ot_wins':number(row.get('VP')),
                'ot_losses':number(row.get('PP')),'losses':number(row.get('P')),
                'gf':int(score[1]) if score else None,'ga':int(score[2]) if score else None,
                'gf_pg':round(int(score[1])/gp,2) if score and gp else None,
                'ga_pg':round(int(score[2])/gp,2) if score and gp else None,
                'pp_pct':number(row.get('VPř')) if pp else None,
                'pk_pct':number(row.get('UOs')) if pk else None,'pp':pp,'pk':pk}
    if len(result['total'])<2: raise ValueError('Tabulka nebyla rozpoznána')
    return result

def parse_schedule(html, fallback=()):
    previous={str(r['id']):r for r in fallback};out={}
    for tr in BeautifulSoup(html,'html.parser').select('tr.js-preview__link[data-href]'):
        m=re.fullmatch(r'/zapas/(\d+)',tr.get('data-href',''))
        if not m: continue
        mid=m[1];names=[n.get_text(' ',strip=True) for n in tr.select('.preview__name--long')]
        codes=[n.get_text(' ',strip=True) for n in tr.select('.preview__name--short')]
        if len(names)!=2 or len(codes)!=2:continue
        dt=previous.get(mid,{}).get('start_at')
        center=tr.select_one('.preview__desktop')
        text=center.get_text(' ',strip=True) if center else ''
        d=re.search(r'(\d{1,2})\.\s*(\d{1,2})\.',text);t=re.search(r'(\d{1,2}):(\d{2})',text)
        if d and t:
            month=int(d[2]);year=SEASON if month>=7 else SEASON+1
            dt=iso(datetime(year,month,int(d[1]),int(t[1]),int(t[2]),tzinfo=PRAGUE))
        if not dt:continue
        heading=tr.find_previous(['h2','h3']);rd=re.search(r'(\d+)\.\s*kolo',heading.get_text() if heading else '')
        out[mid] = {
    'id': mid,
    'start_at': dt,
    'home': {
        'name': names[0],
        'code': games._canonical_team_code(codes[0]),
    },
    'away': {
        'name': names[1],
        'code': games._canonical_team_code(codes[1]),
    },
    'round': (
        rd[1]
        if rd
        else previous.get(mid, {}).get('round', '')
    ),
}
    if not out:raise ValueError('Rozpis nebyl rozpoznán')
    for mid,entry in previous.items():
        if mid not in out:out[mid]=entry
    return list(out.values())

def read_csv_schedule(text):
    rows=[];rd=''
    for cells in csv.reader(io.StringIO(text.lstrip('\ufeff')),delimiter=';'):
        if cells and re.match(r'\d+\.kolo',cells[0]):rd=cells[0].split('.')[0]
        if len(cells)<7 or not cells[6].isdigit():continue
        try:dt=datetime.strptime(cells[4]+' '+cells[5],'%d.%m.%Y %H:%M').replace(tzinfo=PRAGUE)
        except ValueError:continue
        rows.append({'id':cells[6],'start_at':iso(dt),'round':rd,
            'home':{'name':cells[1],'code':games._team_code_from_name(cells[1])},
            'away':{'name':cells[3],'code':games._team_code_from_name(cells[3])}})
    return rows

def comparison(entry, standings, observed_at):
    return {'as_of':iso(observed_at),'source_url':TABLE_URL,
        **{side:{'season':standings['total'].get(entry[side]['code']),
                 'venue':standings[side].get(entry[side]['code'])} for side in ['home','away']}}

def merge_data(old, fresh):
    result=copy.deepcopy(old)
    for key,value in fresh.items():
        if key in ('preview','match_info') and isinstance(value,dict):
            target=result.setdefault(key,{})
            for k,v in value.items():
                if v is not None and v!='' and v!=[] and v!={}:target[k]=v
        elif key in ('roster','statistics') and value.get('status') in ('error','unavailable') and old.get(key,{}).get('status')=='available':
            result[key]['refresh_status']=value['status']
        elif key=='statistics':
            detail=value.get('players_detail') or old.get(key,{}).get('players_detail')
            if detail and detail.get('status')=='error' and old.get(key,{}).get('players_detail',{}).get('status')=='available':
                detail=copy.deepcopy(old[key]['players_detail']);detail['refresh_status']='error'
            result[key]=value
            if detail:result[key]['players_detail']=detail
        else:result[key]=value
    # Missing identity/score in a failed parse must never erase a valid snapshot.
    for side in ('home','away'):
        if not result.get(side,{}).get('code'):result[side]=old.get(side,result.get(side,{}))
    return result

def player_form(history, code):
    skaters = {}; goalies = {}; samples = 0
    for record in history:
        data = record.get('payload', {})
        side = 'home' if data.get('home', {}).get('code') == code else 'away'
        tables = [t for t in data.get('statistics', {}).get('tables', []) if t.get('side') == side]
        if not tables: continue
        samples += 1
        for table in tables:
            labels = [c['label'] for c in table['columns']]
            for row in table.get('rows', []):
                if row.get('not_played'): continue
                v = dict(zip(labels, row.get('cells', []))); name = v.get('Hráč')
                if not name: continue
                if table.get('kind') == 'skaters':
                    g, a = number(v.get('G')), number(v.get('A'))
                    if g is None or a is None: continue
                    item = skaters.setdefault(name, {'name':name, 'goals':0, 'assists':0, 'points':0})
                    item['goals'] += g; item['assists'] += a; item['points'] += g+a
                else:
                    toi = re.fullmatch(r'(\d+):(\d{2})', str(v.get('ČAS', '')))
                    saves, ga = number(v.get('Z')), number(v.get('G'))
                    if not toi or saves is None or ga is None: continue
                    seconds = int(toi[1])*60+int(toi[2])
                    if seconds == 0: continue
                    item = goalies.setdefault(name, {'name':name, 'gp':0, 'saves':0, 'ga':0, 'seconds':0})
                    item['gp']+=1;item['saves']+=saves;item['ga']+=ga;item['seconds']+=seconds
    for g in goalies.values():
        shots=g['saves']+g['ga'];g['sv_pct']=round(100*g['saves']/shots,2) if shots else None
        g['gaa']=round(g['ga']*3600/g['seconds'],2) if g['seconds'] else None
    return {'sample':samples,'players':sorted(skaters.values(),key=lambda p:(-p['points'],-p['goals'],p['name']))[:3],
            'goalies':list(goalies.values())}


class Store:
    def __init__(self):
        self.url=os.environ.get('SUPABASE_URL','').rstrip('/')
        key=os.environ.get('SUPABASE_SECRET_KEY','')
        if not self.url.startswith('https://') or not key:raise ValueError('Vyplň SUPABASE_URL a SUPABASE_SECRET_KEY v prostředí workeru.')
        if key.startswith('sb_publishable_'):raise ValueError('Worker potřebuje secret key; publishable key patří pouze do webu.')
        self.headers={'apikey':key,'Content-Type':'application/json'}
        if key.startswith('eyJ'):self.headers['Authorization']='Bearer '+key
    def request(self,method,path,**kwargs):
        r=requests.request(method,self.url+'/rest/v1/'+path,headers={**self.headers,**kwargs.pop('headers',{})},timeout=(5,20),**kwargs)
        r.raise_for_status();return r.json() if r.content else None
    def get(self,mid):
        rows=self.request('GET','elh_matches',params={'match_id':'eq.'+mid,'select':'*'})
        return rows[0] if rows else None
    def history(self,code,start):
        return self.request('GET','elh_matches',params={'state':'eq.final','start_at':'lt.'+start,
            'or':f'(payload->home->>code.eq.{code},payload->away->>code.eq.{code})','and':f'(start_at.gte.{SEASON}-07-01T00:00:00Z)',
            'select':'payload','order':'start_at.desc','limit':'5'})
    def pending(self):
        return self.request('GET','elh_matches',params={'archived':'eq.false','select':'match_id,start_at,payload','limit':'1000'})
    def save(self,row):
        self.request('POST','elh_matches',headers={'Prefer':'resolution=merge-duplicates,return=minimal'},json=row)
    def lease(self,mid,owner):
        return self.request('POST','rpc/elh_claim_match',json={'p_id':mid,'p_owner':owner}) is True
    def release(self,mid,owner):
        self.request('POST','rpc/elh_release_match',json={'p_id':mid,'p_owner':owner})

def next_interval(state, now, start, final_seen=None, final_complete=False):
    if state=='final':
        if not final_complete:return 300 if final_seen and now-final_seen>=timedelta(minutes=5) else 60
        return 86400 if final_seen and now-final_seen>=timedelta(hours=24) else 300
    if state in ('postponed','suspended'):return 900
    if now<start-timedelta(hours=1):return 1800
    if now<start:return 60
    if now>start+timedelta(hours=8) and state not in ('live','intermission'):return 900
    return 20

class Worker:
    def __init__(self,store):
        self.store=store;self.owner=str(uuid.uuid4());self.league=None;self.league_at=None
        self.schedule=[];self.next_catalog=0;self.due={};self.active={};self.recovery=set();self.match_states={}
    def catalog(self):
        # Local CSV is a bootstrap; current official dates and times override it.
        if not self.schedule:
            path=ROOT/'rozpis.csv'
            text=path.read_text(encoding='utf-8-sig') if path.exists() else fetch_text('https://raw.githubusercontent.com/Adamos1511/ELH_IceStats/refs/heads/main/rozpis.csv')
            self.schedule=read_csv_schedule(text)
        for row in self.store.pending():
            mid=row['match_id'];p=row['payload'];self.recovery.add(mid)
            self.match_states[mid]=p.get('scoreboard',{}).get('state','scheduled')
            if not any(e['id']==mid for e in self.schedule):
                self.schedule.append({'id':mid,'start_at':row['start_at'],'home':p['home'],'away':p['away'],'round':p.get('round','')})
        try:self.schedule=parse_schedule(fetch_text(SCHEDULE_URL),self.schedule)
        except Exception as e:LOG.warning('Rozpis: %s',type(e).__name__)
        try:self.league=parse_standings(fetch_text(TABLE_URL));self.league_at=utcnow()
        except Exception as e:LOG.warning('Tabulka: %s',type(e).__name__)
    def process(self,entry):
        began=time.monotonic();mid=entry['id'];now=utcnow();start=parse_time(entry['start_at'])
        if not self.store.lease(mid,self.owner):return 30
        try:
            row=self.store.get(mid) or {};old=row.get('payload') or {}
            if row.get('archived') and row.get('start_at')==entry['start_at']:return 86400
            previous=old.get('scoreboard',{}).get('state','scheduled')
            seen=parse_time(row.get('final_seen_at'))
            if previous=='final' and seen and old.get('live',{}).get('final_recheck_at') and now<seen+timedelta(hours=24):
                return max(1,(seen+timedelta(hours=24)-now).total_seconds())
            full_at=parse_time(old.get('live',{}).get('full_checked_at'))
            full=not old or previous=='final' or (now<start and (not full_at or (now-full_at).total_seconds()>=1800))
            detail_at=parse_time(old.get('live',{}).get('details_checked_at'))
            details=not detail_at or (now-detail_at).total_seconds()>=120
            fresh=games.inspect_match(mid) if full else games.inspect_live(mid, include_details=details)
            sb=fresh.get('scoreboard',{})
            if not fresh.get('home',{}).get('code') or not fresh.get('away',{}).get('code'):raise ValueError('Neplatná identita')
            if previous in ('live','intermission','final') and (sb.get('home_score') is None or sb.get('away_score') is None):raise ValueError('Chybějící skóre')
            if previous=='final' and sb.get('state')!='final':raise ValueError('Zdroj vrátil starší stav')
            data=merge_data(old,fresh);state=sb.get('state','scheduled')
            if full:data.setdefault('live',{})['full_checked_at']=iso(now)
            if details or full:data.setdefault('live',{})['details_checked_at']=iso(now)
            if now>=start and old.get('preview'):data['preview']=copy.deepcopy(old['preview'])
            # Freeze preview before kickoff: never fill historical preview using today's standings.
            if state=='scheduled' and now<start and self.league and self.league_at and self.league_at<start:
                data.setdefault('preview',{})['comparison']=comparison(entry,self.league,self.league_at)
                if full or not old.get('preview',{}).get('form'):
                    try:data['preview']['form']={side:player_form(self.store.history(entry[side]['code'],entry['start_at']),entry[side]['code']) for side in ('home','away')}
                    except requests.RequestException:pass
            if now>=start-timedelta(hours=1) and state!='final':
                last=parse_time(old.get('live',{}).get('roster_checked_at'))
                if not last or (now-last).total_seconds()>=60:
                    try:
                        with requests.Session() as session:page=games._download_page(session,'roster',games._match_url(mid)+'/roster')
                        data=merge_data(data,{'roster':games._download_match_roster(page)})
                        data.setdefault('live',{})['roster_checked_at']=iso(now)
                    except (requests.RequestException,ValueError):pass
            refs=data.get('roster',{}).get('referees',{})
            info=data.setdefault('match_info',{}).setdefault('referees',{})
            for role in ('main','lines'):
                if not info.get(role) and refs.get(role):info[role]=refs[role]
            if state=='final' and seen is None:seen=now
            complete=full and state=='final' and fresh.get('statistics',{}).get('status')=='available' and fresh.get('statistics',{}).get('players_detail',{}).get('status')!='error' and fresh.get('roster',{}).get('status')!='error'
            final_complete=complete or bool(row.get('final_complete'))
            archived=bool(complete and seen and now-seen>=timedelta(hours=24))
            if complete and seen and now-seen>=timedelta(minutes=5):
                data.setdefault('live',{})['final_recheck_at']=iso(now)
            data['mode']='full';data['live']={**data.get('live',{}),'checked_at':iso(utcnow()),'archived':archived,'automated':True,'final_complete':final_complete,'start_at':entry['start_at']}
            start_from_source=None
            try:start_from_source=iso(datetime.strptime(data['date']+' '+data['time'],'%d.%m.%Y %H:%M').replace(tzinfo=PRAGUE))
            except (KeyError,ValueError):pass
            self.store.save({'match_id':mid,'start_at':start_from_source or entry['start_at'],'state':state,'payload':data,
                'checked_at':data['live']['checked_at'],'final_seen_at':iso(seen) if seen else None,
                'final_complete':final_complete,'archived':archived})
            self.match_states[mid]=state
            LOG.info('%s %s %s:%s',mid,state,sb.get('home_score'),sb.get('away_score'))
            if state=='final' and complete and seen:
                delay=86400 if archived else max(1,((seen+timedelta(hours=24) if data['live'].get('final_recheck_at') else seen+timedelta(minutes=5))-now).total_seconds())
            else:delay=next_interval(state,now,start,seen,False)
            return max(1,delay-(time.monotonic()-began))
        finally:self.store.release(mid,self.owner)
    def has_live_window(self, now):
        for entry in self.schedule:
            start=parse_time(entry['start_at']);state=self.match_states.get(entry['id'],'scheduled')
            if state in ('live','intermission'):return True
            if start and state not in ('final','postponed','suspended') and start-timedelta(minutes=90)<=now<=start+timedelta(hours=6):return True
        return False

    def run(self,once=False,session=False,max_seconds=None):
        deadline=time.monotonic()+max_seconds if max_seconds is not None else None
        if once or session:self.catalog()
        if session:self.next_catalog=time.monotonic()+900
        catalog_future=None
        with ThreadPoolExecutor(max_workers=8) as pool, ThreadPoolExecutor(max_workers=1) as catalog_pool:
            while True:
                if deadline is not None and time.monotonic()>=deadline:
                    LOG.info('Časové okno úlohy končí; dokončuji aktivní zápisy.')
                    break
                if not once and catalog_future is None and time.monotonic()>=self.next_catalog:
                    catalog_future=catalog_pool.submit(self.catalog)
                if catalog_future is not None and catalog_future.done():
                    try:catalog_future.result();self.next_catalog=time.monotonic()+900
                    except Exception as e:LOG.warning('Catalog failed: %s',type(e).__name__);self.next_catalog=time.monotonic()+60
                    catalog_future=None
                now=utcnow()
                for mid,future in list(self.active.items()):
                    if future.done():
                        try:delay=future.result()
                        except Exception as e:LOG.warning('%s update failed: %s',mid,type(e).__name__);delay=60
                        self.due[mid]=time.monotonic()+delay;del self.active[mid]
                for entry in sorted(self.schedule,key=lambda e:abs((parse_time(e["start_at"])-now).total_seconds())):
                    start=parse_time(entry['start_at']);mid=entry['id']
                    if not start or (mid not in self.recovery and not now-timedelta(days=2)<=start<=now+timedelta(days=7)):continue
                    if (once or len(self.active)<8) and mid not in self.active and time.monotonic()>=self.due.get(mid,0):
                        self.active[mid]=pool.submit(self.process,entry)
                if once:
                    for f in self.active.values():f.result()
                    return
                if session and not self.active and not self.has_live_window(now):
                    LOG.info('Bez blížícího se nebo živého zápasu; dávková aktualizace dokončena.')
                    break
                time.sleep(2)

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--once',action='store_true')
    p.add_argument('--session',action='store_true',help='Běží jen kolem zápasů, jinak provede jednu dávku.')
    p.add_argument('--max-seconds',type=int,default=None)
    args=p.parse_args()
    if args.max_seconds is not None and args.max_seconds<1:p.error('--max-seconds musí být kladné číslo.')
    logging.basicConfig(level=logging.INFO,format='%(asctime)s %(levelname)s %(message)s')
    Worker(Store()).run(args.once,args.session,args.max_seconds)
if __name__=='__main__':main()
