import asyncio, sys, base64
from playwright.async_api import async_playwright
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8080/'
async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch(args=['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    ctx = await b.new_context(viewport={'width':412,'height':915}, device_scale_factor=2, is_mobile=True, has_touch=True)
    pg = await ctx.new_page()
    pg.on('console', lambda m: print('console:', m.text))
    pg.on('pageerror', lambda e: print('PAGEERROR', e))
    await pg.goto(URL); await pg.wait_for_function('window.__ready', timeout=60000); await pg.wait_for_timeout(1500)
    async def shot(name, js, wait=600):
      await pg.evaluate(js); await pg.wait_for_timeout(wait); await pg.screenshot(path=f'shots/{name}.png')
    await pg.screenshot(path='shots/p_intro.png')
    await shot('p_entrance', 'app.look(0,-0.05,90)')
    await shot('p_water', 'app.look(Math.PI,-0.05,90)')
    await shot('p_niche', 'app.look(Math.PI/2,-0.05,90)')
    await shot('p_banquet', 'app.look(-Math.PI/2,-0.05,90)')
    await shot('p_ceiling', 'app.look(0,1.4,95)')
    await shot('p_floor', 'app.look(Math.PI/2,-1.4,95)')
    await pg.set_viewport_size({'width':915,'height':412}); await pg.wait_for_timeout(500)
    await shot('l_long', "app.goTo(app.VIEWS[5],true); app.look(-Math.PI/2,0.05,80)")
    await shot('l_corner', "app.goTo(app.VIEWS[0],true); app.look(Math.PI*0.75,0.1,90)")
    await shot('l_arrival', "app.goTo(app.VIEWS[1],true); app.look(Math.PI,0.0,80)")
    await pg.evaluate("app.goTo(app.VIEWS[0],true); window.__mockGyro={yaw:0.35,pitch:0.08}; app.enterVR({noGyro:true,noFullscreen:true,noRotatePrompt:true})")
    await pg.wait_for_timeout(1500); await pg.screenshot(path='shots/vr_split.png')
    await pg.evaluate("app.setDistortion(true)"); await pg.wait_for_timeout(2500); await pg.screenshot(path='shots/vr_split_lens.png')
    await pg.evaluate("app.setDistortion(false); app.exitVR(); window.__mockGyro=null")
    if '--pano' in sys.argv:
      await pg.set_viewport_size({'width':1200,'height':800})
      d = await pg.evaluate("app.exportPanorama(8192,0.9)")
      open('pano/wedding-hall-360-8k.jpg','wb').write(base64.b64decode(d.split(',')[1])); print('pano saved')
    await b.close()
asyncio.run(main())
