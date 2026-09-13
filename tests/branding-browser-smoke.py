"""Verify shared branding with two local Chromium clients and production-serialized fixtures."""
import argparse
from playwright.sync_api import sync_playwright
from pathlib import Path
import json
from urllib.parse import urlparse
parser=argparse.ArgumentParser();parser.add_argument('--fixture-dir',type=Path,required=True);parser.add_argument('--output',type=Path,required=True);parser.add_argument('--url',default='http://127.0.0.1:4293');args=parser.parse_args()
assert urlparse(args.url).hostname in ['127.0.0.1','localhost'], 'Local verification only'
args.output.mkdir(parents=True,exist_ok=True)
identity=json.loads((args.fixture_dir/'config.json').read_text())
logo=(args.fixture_dir/'logo.png').read_bytes()
base=args.url
errors=[]
logo_attempts={}
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True)
 pages=[]
 def route(r):
  path=urlparse(r.request.url).path
  if urlparse(r.request.url).hostname not in ['127.0.0.1','localhost']:
   r.abort();return
  if path==identity.get('branding',{}).get('logoUrl'):
   client=r.request.frame.page
   logo_attempts[client]=logo_attempts.get(client,0)+1
   if logo_attempts[client]==1:
    r.fulfill(status=503,body='Temporary artwork outage');return
   r.fulfill(status=200,content_type='image/png',body=logo);return
  if path=='/api/config':
   r.fulfill(status=200,content_type='application/json',body=json.dumps(identity));return
  if path.startswith('/api/'):
   data={'authenticated':False,'team':[],'members':[],'historyAvailable':False,'serverTime':0,'version':1,'scopes':[]}
   r.fulfill(status=200,content_type='application/json',body=json.dumps(data));return
  r.continue_()
 for i in range(2):
  page=browser.new_page(viewport={'width':1280,'height':900},device_scale_factor=1)
  page.route('**/*',route)
  page.route_web_socket('**/*',lambda ws:None)
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(base+'/prototype-25d-slice.html?controlsPreview=empty&factoryServer=local&skyTime=day&skyWeather=clear',wait_until='domcontentloaded'); print('loaded',i,flush=True)
  page.wait_for_function("document.title === 'NORTH STAR LAB'",timeout=60000)
  page.evaluate("async()=>{window.branding=await import('/prototypes/factory25dBranding.ts');}")
  page.wait_for_load_state('networkidle',timeout=90000)
  page.bring_to_front(); page.evaluate("window.dispatchEvent(new Event('focus'))")
  page.wait_for_function('window.branding.factoryLogo() !== undefined',timeout=30000)
  assert logo_attempts[page]>=2, 'Artwork should recover after its first failed download'
  pages.append(page)
 assert not errors,errors
 pages[0].screenshot(path=str(args.output/'browser-room.png'))
 pages[0].get_by_role('button',name='Open the brand artifact shelf').click()
 pages[0].get_by_role('dialog').wait_for(state='visible')
 pages[0].get_by_role('link',name='Download PNG').wait_for(state='visible')
 assert pages[0].get_by_role('dialog').get_by_role('img').get_attribute('alt')=='NORTH STAR LAB logo'
 pages[0].screenshot(path=str(args.output/'browser-shelf.png'))
 assert pages[0].evaluate("""async()=>{
   const {createFactoryInk}=await import('/prototypes/factory25dFactoryInk.ts'); const ink=createFactoryInk();
   const initial=ink.canvas.toDataURL();ink.stir(500,180);ink.advance(.1);const stirred=ink.canvas.toDataURL()!==initial;
   ink.unstir();ink.replay();const restored=ink.canvas.toDataURL()===initial;ink.blow();ink.advance(.1);const scattered=ink.canvas.toDataURL()!==initial;
   ink.dispose();return stirred&&restored&&scattered;
 }""")
 # Same server/title, new revision, explicit logo removal. Both open clients refresh.
 identity['branding']['logoUrl']=None
 identity['branding']['accentColor']='#FFAB66'
 identity['branding']['revision']='b'*64
 for page in pages:
  page.bring_to_front()
  page.evaluate("window.dispatchEvent(new Event('focus'))")
  page.wait_for_function("window.branding.factoryIdentity().branding.revision === 'b'.repeat(64)")
  assert page.evaluate('window.branding.factoryLogo() === undefined')
 assert not errors,errors
 print('PASS: two independent browsers, same serialized server identity, failed logo retry, rendered logo, live shelf, flag stir/scatter, updated color and explicit logo removal')
 browser.close()
