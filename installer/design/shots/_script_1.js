
  (function () {
    var root = document.documentElement;
    var windowEl = document.querySelector('.window');
    var screens = Array.prototype.slice.call(document.querySelectorAll('.screen'));
    var stepButtons = Array.prototype.slice.call(document.querySelectorAll('.step'));
    var themeToggle = document.getElementById('themeToggle');
    var toast = document.getElementById('toast');
    var toastText = document.getElementById('toastText');
    var toastTimer = null;
    var activeScreen = 'welcome';

    function storeTheme(theme) {
      try { localStorage.setItem('sorarin-installer-theme', theme); } catch (error) {}
    }

    function syncThemeButton() {
      var dark = root.classList.contains('dark');
      themeToggle.setAttribute('aria-pressed', String(dark));
      themeToggle.setAttribute('aria-label', dark ? '鍒囨崲鍒版祬鑹叉ā寮? : '鍒囨崲鍒版繁鑹叉ā寮?);
      themeToggle.title = dark ? '鍒囨崲鍒版祬鑹叉ā寮? : '鍒囨崲鍒版繁鑹叉ā寮?;
    }

    function setTheme(theme) {
      root.classList.toggle('dark', theme === 'dark');
      storeTheme(theme);
      syncThemeButton();
    }

    function updateUrl(screen) {
      try {
        var url = new URL(location.href);
        url.searchParams.set('screen', screen);
        url.searchParams.delete('still');
        history.replaceState(null, '', url.toString());
      } catch (error) {}
    }

    function showToast(message) {
      toastText.textContent = message;
      toast.classList.add('is-visible');
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(function () {
        toast.classList.remove('is-visible');
      }, 2600);
    }

    function setScreen(screen, options) {
      if (!screen || !screens.some(function (item) { return item.dataset.screen === screen; })) return;
      activeScreen = screen;
      windowEl.setAttribute('data-active', screen);
      screens.forEach(function (item) {
        var active = item.dataset.screen === screen;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-hidden', active ? 'false' : 'true');
        item.inert = !active;
      });
      stepButtons.forEach(function (button) {
        if (button.dataset.go === screen) button.setAttribute('aria-current', 'step');
        else button.removeAttribute('aria-current');
      });
      if (options && options.resetScroll) {
        var heading = document.querySelector('.screen[data-screen="' + screen + '"] h1');
        if (heading) heading.setAttribute('tabindex', '-1');
      }
      if (!options || options.updateUrl !== false) updateUrl(screen);
      closeCancelModal();
    }

    themeToggle.addEventListener('click', function () {
      setTheme(root.classList.contains('dark') ? 'light' : 'dark');
    });

    document.addEventListener('click', function (event) {
      var goButton = event.target.closest('[data-go]');
      if (goButton) {
        event.preventDefault();
        setScreen(goButton.dataset.go, { resetScroll: true });
        if (goButton.closest('.step')) {
          var targetHeading = document.querySelector('.screen[data-screen="' + goButton.dataset.go + '"] h1');
          if (targetHeading) {
            targetHeading.setAttribute('tabindex', '-1');
            targetHeading.focus({ preventScroll: true });
          }
        }
      }

      var winAction = event.target.closest('[data-window-action]');
      if (winAction) {
        event.preventDefault();
        showToast('闈欐€佸師鍨嬶細绐楀彛' + (winAction.dataset.windowAction === 'minimize' ? '鏈€灏忓寲' : '鍏抽棴') + '鐢?Tauri 鎺ョ銆?);
      }

      var browse = event.target.closest('[data-action="browse"]');
      if (browse) {
        event.preventDefault();
        showToast('鍘熷瀷婕旂ず锛歍auri 涓皢璋冪敤 pick_directory 閫夋嫨鏂囦欢澶广€?);
      }

      var openDir = event.target.closest('[data-action="open-dir"]');
      if (openDir) {
        event.preventDefault();
        showToast('鍘熷瀷婕旂ず锛氳繖閲屼細鎵撳紑瀹夎鐩綍銆?);
      }

      var finish = event.target.closest('[data-action="finish"]');
      if (finish) {
        event.preventDefault();
        showToast('鍘熷瀷婕旂ず锛氬畬鎴愭寜閽細鍏抽棴瀹夎绋嬪簭锛屽苟鎸夊嬀閫夌姸鎬佸惎鍔?SorarinBot銆?);
      }

      if (event.target.closest('[data-license-close]')) {
        setLicense(false);
      }
    });

    var switches = Array.prototype.slice.call(document.querySelectorAll('.switch'));
    switches.forEach(function (toggle) {
      toggle.addEventListener('click', function () {
        var on = toggle.getAttribute('aria-checked') === 'true';
        toggle.setAttribute('aria-checked', on ? 'false' : 'true');
      });
    });

    var licenseRow = document.getElementById('licenseRow');
    var licenseToggle = document.getElementById('licenseToggle');
    var licensePopover = document.getElementById('licensePopover');
    function setLicense(open) {
      licenseRow.classList.toggle('is-open', open);
      licenseToggle.setAttribute('aria-expanded', String(open));
      licensePopover.setAttribute('aria-hidden', String(!open));
      licenseToggle.querySelector('.license-view').textContent = open ? '鏀惰捣' : '鏌ョ湅';
      if (open) {
        var closeButton = licensePopover.querySelector('.license-close');
        if (closeButton) closeButton.focus({ preventScroll: true });
      }
    }
    licenseToggle.addEventListener('click', function () {
      setLicense(!licenseRow.classList.contains('is-open'));
    });

    var zipInput = document.getElementById('zipInput');
    var zipDropzone = document.getElementById('zipDropzone');
    var zipTitle = document.getElementById('zipTitle');
    var zipHint = document.getElementById('zipHint');
    zipDropzone.addEventListener('click', function () { zipInput.click(); });
    zipInput.addEventListener('change', function () {
      if (!zipInput.files || !zipInput.files.length) return;
      var file = zipInput.files[0];
      zipTitle.textContent = file.name;
      zipHint.textContent = '宸查€夋嫨 路 ' + Math.max(1, Math.round(file.size / 1024)) + ' KB';
      zipDropzone.classList.add('has-file');
    });
    ['dragenter', 'dragover'].forEach(function (name) {
      zipDropzone.addEventListener(name, function (event) {
        event.preventDefault();
        zipDropzone.classList.add('is-dragging');
      });
    });
    ['dragleave', 'drop'].forEach(function (name) {
      zipDropzone.addEventListener(name, function (event) {
        event.preventDefault();
        zipDropzone.classList.remove('is-dragging');
      });
    });
    zipDropzone.addEventListener('drop', function (event) {
      if (event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files.length) {
        var file = event.dataTransfer.files[0];
        zipTitle.textContent = file.name;
        zipHint.textContent = '宸查€夋嫨 路 ' + Math.max(1, Math.round(file.size / 1024)) + ' KB';
      }
    });

    var modal = document.getElementById('cancelModal');
    var cancelDownload = document.getElementById('cancelDownload');
    var keepDownloading = document.getElementById('keepDownloading');
    var confirmCancel = document.getElementById('confirmCancel');
    function openCancelModal() {
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
      keepDownloading.focus({ preventScroll: true });
    }
    function closeCancelModal() {
      if (!modal.classList.contains('is-open')) return;
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
    }
    cancelDownload.addEventListener('click', openCancelModal);
    keepDownloading.addEventListener('click', closeCancelModal);
    confirmCancel.addEventListener('click', function () {
      closeCancelModal();
      setScreen('options');
      showToast('宸插彇娑堟湰娆′笅杞斤紝鏈鐢佃剳鍋氫换浣曟洿鏀广€?);
    });
    modal.addEventListener('click', function (event) {
      if (event.target === modal) closeCancelModal();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        closeCancelModal();
        if (licenseRow.classList.contains('is-open')) setLicense(false);
      }
    });

    var params = new URLSearchParams(location.search);
    var requested = params.get('screen');
    var allowed = ['welcome', 'options', 'progress', 'finish'];
    setScreen(allowed.indexOf(requested) !== -1 ? requested : 'welcome', { updateUrl: false });
    syncThemeButton();
  })();

