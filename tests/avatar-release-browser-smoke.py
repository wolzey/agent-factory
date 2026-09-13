"""Actual browser editor: lost successful response and competing native-style edit recovery."""
from playwright.sync_api import sync_playwright, expect
origin='http://127.0.0.1:4275'
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    context=browser.new_context(viewport={'width':1100,'height':850})
    context.request.post(origin+'/__test/login')
    page=context.new_page(); errors=[]; page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda msg:print(msg.type,msg.text) if msg.type=='error' else None)
    page.goto(origin+'/avatar-test');page.wait_for_load_state('networkidle')
    assert not errors,errors
    expect(page.get_by_role('heading',name='edit avatar',exact=True)).to_be_visible()
    page.get_by_label('hair',exact=True).select_option('4')
    lost=[False]
    def lose_success(route):
        if route.request.method=='PUT' and not lost[0]:
            result=route.fetch();assert result.status==200;lost[0]=True;route.abort()
        else: route.continue_()
    page.route('**/api/avatar',lose_success)
    page.get_by_role('button',name='save avatar',exact=True).click()
    expect(page.locator('body')).to_have_attribute('data-saved','yes')
    assert lost[0]
    page.unroute('**/api/avatar',lose_success)
    page.goto(origin+'/avatar-test');page.wait_for_load_state('networkidle')
    page.get_by_label('hair',exact=True).select_option('2')
    current=context.request.get(origin+'/api/avatar').json()
    competing={**current['avatar'],'shirtColor':'#123456','color':'#123456'}
    response=context.request.put(origin+'/api/avatar',headers={'Origin':origin,'X-Avatar-Owner':'A'*43},data={'avatar':competing,'revision':current['revision']})
    assert response.status==200
    page.get_by_role('button',name='save avatar',exact=True).click()
    expect(page.get_by_role('button',name='reapply my edits',exact=True)).to_be_visible()
    expect(page.get_by_role('button',name='save avatar',exact=True)).to_be_disabled()
    assert context.request.get(origin+'/api/avatar').json()['avatar']['hairStyle']==4
    page.get_by_role('button',name='reapply my edits',exact=True).click()
    page.get_by_role('button',name='save avatar',exact=True).click()
    expect(page.locator('body')).to_have_attribute('data-saved','yes')
    final=context.request.get(origin+'/api/avatar').json()['avatar']
    assert final['hairStyle']==2 and final['shirtColor']=='#123456'
    assert not errors,errors
    context.close();browser.close()
print('Browser lost-save confirmation and deliberate conflict reapplication passed.')
