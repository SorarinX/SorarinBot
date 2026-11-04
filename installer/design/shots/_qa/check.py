from playwright.sync_api import sync_playwright
import json

BASE = "http://127.0.0.1:8765/installer/design/index.html"
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
errors = []

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path=CHROME)
    context = browser.new_context(viewport={"width": 1000, "height": 660}, device_scale_factor=1)
    page = context.new_page()
    page.on("console", lambda msg: errors.append(f"console {msg.type}: {msg.text}") if msg.type in ("error", "warning") else None)
    page.on("pageerror", lambda exc: errors.append(f"pageerror: {exc}"))
    page.goto(BASE + "?screen=welcome&theme=light&still=1", wait_until="networkidle")
    page.wait_for_timeout(300)
    info = {}
    info["viewport"] = page.viewport_size
    info["dimensions"] = page.evaluate("""() => { const w = document.querySelector('.window').getBoundingClientRect(); return {window:[w.width,w.height], inner:[innerWidth,innerHeight], scroll:[document.documentElement.scrollWidth, document.documentElement.scrollHeight]}; }""")
    info["fonts"] = page.evaluate("""() => ({status: document.fonts.status, inter: document.fonts.check('12px \"Inter Variable\"'), sora: document.fonts.check('12px \"Sora Variable\"'), body: getComputedStyle(document.body).fontFamily, h1: getComputedStyle(document.querySelector('.welcome-hero h1')).fontFamily})""")
    info["welcome_content"] = page.evaluate("""() => { const inn = document.querySelector('.welcome-inner').getBoundingClientRect(); const foot = document.querySelector('.welcome-foot').getBoundingClientRect(); const actions = document.querySelector('.welcome-actions').getBoundingClientRect(); return {inner:[inn.top,inn.bottom], actions:[actions.top,actions.bottom], foot:[foot.top,foot.bottom], gapActionsToFoot: foot.top - actions.bottom}; }""")
    # Theme toggle
    page.click('#themeToggle')
    page.wait_for_timeout(250)
    info["theme_after_click"] = page.evaluate("() => ({dark: document.documentElement.classList.contains('dark'), pressed: document.querySelector('#themeToggle').getAttribute('aria-pressed'), label: document.querySelector('#themeToggle').getAttribute('aria-label')})")
    page.click('#themeToggle')
    page.wait_for_timeout(200)
    # Navigate to options via CTA
    page.click('button[data-go="options"]')
    page.wait_for_timeout(350)
    info["options_after_nav"] = page.evaluate("""() => ({url: location.search, active: document.querySelector('.window').dataset.active, rail: getComputedStyle(document.querySelector('.brand-rail')).display, current: document.querySelector('.step[aria-current=step]').dataset.go, heading: document.querySelector('#options-title').textContent.trim(), screen_rect: (()=>{const r=document.querySelector('.screen--options').getBoundingClientRect(); return [r.width,r.height]})()})""")
    # License accordion
    page.click('#licenseToggle')
    page.wait_for_timeout(250)
    info["license_open"] = page.evaluate("""() => ({expanded: document.querySelector('#licenseToggle').getAttribute('aria-expanded'), open: document.querySelector('#licenseRow').classList.contains('is-open'), popover: (()=>{const r=document.querySelector('#licensePopover').getBoundingClientRect(); return {top:r.top,bottom:r.bottom,height:r.height,vis:getComputedStyle(document.querySelector('#licensePopover')).visibility};})()})""")
    page.click('[data-license-close]')
    page.wait_for_timeout(200)
    # Switch
    before = page.get_attribute('.switch', 'aria-checked')
    page.click('.switch')
    after = page.get_attribute('.switch', 'aria-checked')
    info["switch"] = [before, after]
    # Panel/foot bounds
    info["options_bounds"] = page.evaluate("""() => { const foot = document.querySelector('.options-foot').getBoundingClientRect(); const cards = [...document.querySelectorAll('.options-grid > .glass-panel')].map(x=>{const r=x.getBoundingClientRect(); return [r.top,r.bottom,r.height]}); return {foot:[foot.top,foot.bottom], cards, overflow: [...document.querySelectorAll('.options-grid .glass-panel')].map(x=>({scroll:x.scrollHeight,client:x.clientHeight}))}; }""")
    # Next to progress
    page.click('button[data-go="progress"][class*="btn--primary"]')
    page.wait_for_timeout(350)
    info["progress_bounds"] = page.evaluate("""() => { const el = s => {const r=document.querySelector(s).getBoundingClientRect(); return [Math.round(r.top),Math.round(r.bottom),Math.round(r.height)]}; return {download:el('.download-panel'), phase:el('.install-phase'), foot:el('.progress-foot'), title:document.querySelector('#progress-title').textContent.trim(), phase_title:document.querySelector('.phase-title').textContent.trim(), pct:document.querySelector('.gauge-value').textContent.trim(), cancel:el('#cancelDownload'), progressbar:document.querySelector('.progress-bar').getBoundingClientRect().width}; }""")
    # Cancel modal
    page.click('#cancelDownload')
    page.wait_for_timeout(250)
    info["cancel_modal"] = page.evaluate("""() => ({open: document.querySelector('#cancelModal').classList.contains('is-open'), hidden: document.querySelector('#cancelModal').getAttribute('aria-hidden'), visible: getComputedStyle(document.querySelector('#cancelModal')).visibility, active: document.activeElement.id})""")
    page.click('#keepDownloading')
    page.wait_for_timeout(200)
    # Finish screen
    page.click('button[data-go="finish"].step')
    page.wait_for_timeout(350)
    info["finish_bounds"] = page.evaluate("""() => { const win = document.querySelector('.window').getBoundingClientRect(); const foot = document.querySelector('.finish-foot').getBoundingClientRect(); const actions = document.querySelector('.finish-actions').getBoundingClientRect(); return {footer:[foot.top,foot.bottom], actions:[actions.top,actions.bottom], window:[win.top,win.bottom], footInside: foot.bottom <= win.bottom - 8, version: document.querySelector('.finish-version-inline').textContent.trim(), launchChecked: document.querySelector('#launchApp').checked, buttons: [...document.querySelectorAll('.finish-actions button')].map(b=>b.textContent.trim())}; }""")
    # Keyboard tab? Check h1 focused on step nav clicks
    info["focus_after_step"] = page.evaluate("() => ({tag: document.activeElement.tagName, id: document.activeElement.id, text: (document.activeElement.textContent||'').trim().slice(0,30)})")
    # Reduced motion
    redctx = browser.new_context(viewport={"width":1000,"height":660}, reduced_motion="reduce")
    redpage = redctx.new_page()
    redpage.goto(BASE + "?screen=welcome&theme=light", wait_until="networkidle")
    info["reduced_motion"] = redpage.evaluate("""() => ({blobAnim: getComputedStyle(document.querySelector('.blob')).animationName, sheen: getComputedStyle(document.querySelector('.progress-fill'), '::after').animationName || null})""")
    redctx.close()
    print(json.dumps(info, ensure_ascii=False, indent=2))
    print("CONSOLE_ERRORS", json.dumps(errors, ensure_ascii=False))
    browser.close()
