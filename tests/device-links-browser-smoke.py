"""Real browser approval + revocation against a local server and actual durable grant store."""
import base64,hashlib,secrets
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
origin='http://127.0.0.1:4275'
def encoded(raw):return base64.urlsafe_b64encode(raw).decode().rstrip('=')
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    context=browser.new_context(viewport={'width':1100,'height':850})
    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    native=p.request.new_context(base_url=origin)
    token='afn1_'+encoded(secrets.token_bytes(32))
    created=native.post('/api/auth/devices/link',data={'deviceName':'iPad · local test','tokenHash':encoded(hashlib.sha256(token.encode()).digest()),'avatarWrite':True})
    assert created.status==200;link=created.json();headers={'Authorization':'Bearer '+token}
    assert native.post('/api/auth/devices/link/exchange',headers=headers,data={'requestId':link['requestId']}).json()['status']=='pending'
    context.request.post(origin+'/__test/login')
    page.goto(origin);page.wait_for_load_state('networkidle')
    expect(page.get_by_role('heading',name='Link a device',exact=True)).to_be_visible()
    page.get_by_label('Code shown in the Mac or iPad app').fill(link['userCode'])
    page.get_by_role('button',name='Check code',exact=True).click()
    expect(page.locator('.device-approval')).to_be_visible()
    expect(page.locator('.device-approval h3')).to_contain_text('iPad · local test')
    expect(page.locator('.device-approval')).to_contain_text('edit')
    Path('/tmp/af-device-link-evidence').mkdir(exist_ok=True)
    page.screenshot(path='/tmp/af-device-link-evidence/browser-approval.png',full_page=True)
    page.get_by_role('button',name='Connect this device',exact=True).click()
    expect(page.get_by_role('status')).to_contain_text('Approved.')
    exchange=native.post('/api/auth/devices/link/exchange',headers=headers,data={'requestId':link['requestId']})
    assert exchange.status==200 and exchange.json()['ownerId']=='A'*43
    assert native.get('/api/auth/native/session',headers=headers).json()['device']['avatarWrite'] is True
    page.get_by_role('button',name='Refresh devices',exact=True).click()
    expect(page.locator('.device-list')).to_contain_text('iPad · local test')
    page.set_viewport_size({'width':390,'height':844})
    page.screenshot(path='/tmp/af-device-link-evidence/browser-devices-mobile.png',full_page=True)
    page.get_by_role('button',name='Disconnect',exact=True).click()
    page.get_by_role('button',name='Confirm disconnect',exact=True).click()
    expect(page.get_by_role('status')).to_contain_text('disconnected.')
    assert native.get('/api/auth/native/session',headers=headers).status==401
    assert not errors,errors
    native.dispose();context.close();browser.close()
print('Browser approval, durable exchange, responsive device list, and revocation passed.')
