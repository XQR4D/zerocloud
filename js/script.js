let currentMode = 'auto';
      let tokenDebounce = null;
      let progressLogEntry = null;

      function setMode(mode) {
        currentMode = mode;
        document
          .getElementById('modeAuto')
          .classList.toggle('active', mode === 'auto');
        document
          .getElementById('modeManual')
          .classList.toggle('active', mode === 'manual');
        document
          .getElementById('manualFields')
          .classList.toggle('visible', mode === 'manual');
      }

      const dropzone = document.getElementById('dropzone');
      const fileInput = document.getElementById('file');
      const dropzoneFilename = document.getElementById('dropzoneFilename');

      function setFile(file) {
        if (!file) return;

        const dt = new DataTransfer();
        dt.items.add(file);
        fileInput.files = dt.files;

        dropzone.classList.add('has-file');
        dropzoneFilename.textContent = file.name + '  ·  ' + formatSize(file.size);

        const name = file.name;
        const lastDot = name.lastIndexOf('.');
        const baseName = lastDot > 0 ? name.slice(0, lastDot) : name;
        const ext = lastDot > 0 ? name.slice(lastDot) : '';

        document.getElementById('customFilename').value = baseName;
        document.getElementById('fileExt').textContent = ext || '';
      }

      function formatSize(bytes) {
        if (bytes < 1024) return bytes + ' Б';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' КБ';
        if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(2) + ' МБ';
        return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' ГБ';
      }

      dropzone.addEventListener('click', () => fileInput.click());

      fileInput.addEventListener('change', function () {
        if (this.files[0]) setFile(this.files[0]);
      });

      ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((eventName) => {
        dropzone.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
        });
      });

      dropzone.addEventListener('dragenter', () => dropzone.classList.add('dragover'));
      dropzone.addEventListener('dragover', () => dropzone.classList.add('dragover'));
      dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));

      dropzone.addEventListener('drop', (e) => {
        dropzone.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
          setFile(files[0]);
        }
      });

      function getTime() {
        const now = new Date();
        return now.toLocaleTimeString('ru-RU', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
      }

      function log(msg, type = 'info') {
        const el = document.getElementById('log');
        el.classList.add('visible');

        const icons = {
          info: '→',
          success: '✓',
          error: '✕',
        };

        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;
        entry.innerHTML = `
          <span class="log-time">${getTime()}</span>
          <span class="log-icon">${icons[type] || '→'}</span>
          <span class="log-msg">${msg}</span>
        `;
        el.appendChild(entry);
        el.scrollTop = el.scrollHeight;
        return entry;
      }

      function clearLog() {
        const el = document.getElementById('log');
        el.innerHTML = '';
        el.classList.remove('visible');
        progressLogEntry = null;
      }

      function updateProgressLog(percent) {
        const msg = `Загружаю файл... ${percent}%`;
        if (progressLogEntry) {
          progressLogEntry.querySelector('.log-msg').textContent = msg;
        } else {
          progressLogEntry = log(msg, 'info');
        }
      }

      function generateTag() {
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        return `v${now.getFullYear()}.${pad(now.getMonth() + 1)}.${pad(now.getDate())}.${pad(now.getHours())}${pad(now.getMinutes())}`;
      }

      async function fetchRepos(token) {
        const box = document.getElementById('reposBox');
        const status = document.getElementById('reposStatus');
        const select = document.getElementById('repoSelect');

        if (!token || token.length < 10) {
          box.classList.remove('visible');
          return;
        }

        box.classList.add('visible');
        status.className = 'repos-status loading';
        status.textContent = 'Загружаю список репозиториев...';
        select.innerHTML = '<option value="">Выберите репозиторий</option>';

        try {
          const res = await fetch(
            'https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator',
            {
              headers: {
                Authorization: `token ${token}`,
                Accept: 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
              },
            }
          );

          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.message || `HTTP ${res.status}`);
          }

          const repos = await res.json();

          if (!Array.isArray(repos) || repos.length === 0) {
            status.className = 'repos-status error';
            status.textContent = 'Репозитории не найдены';
            return;
          }

          const writable = repos.filter((r) => r.permissions?.push !== false);

          writable.forEach((repo) => {
            const opt = document.createElement('option');
            opt.value = repo.full_name;
            opt.textContent = repo.full_name + (repo.private ? ' 🔒' : '');
            select.appendChild(opt);
          });

          status.className = 'repos-status';
          status.textContent = `Найдено ${writable.length} репозиториев`;
        } catch (e) {
          status.className = 'repos-status error';
          status.textContent = 'Ошибка: ' + e.message;
        }
      }

      document.getElementById('repoSelect').addEventListener('change', function () {
        const val = this.value;
        if (!val) return;
        const [owner, ...rest] = val.split('/');
        const repo = rest.join('/');
        document.getElementById('owner').value = owner;
        document.getElementById('repo').value = repo;
      });

      document.getElementById('token').addEventListener('input', function () {
        clearTimeout(tokenDebounce);
        const token = this.value.trim();
        tokenDebounce = setTimeout(() => fetchRepos(token), 600);
      });

      document.getElementById('token').addEventListener('blur', function () {
        clearTimeout(tokenDebounce);
        fetchRepos(this.value.trim());
      });

      function uploadWithProgress(url, formData, onProgress) {
        return new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', url);

          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const percent = Math.round((e.loaded / e.total) * 100);
              onProgress(percent);
            }
          };

          xhr.onload = () => {
            resolve({
              ok: xhr.status >= 200 && xhr.status < 300,
              status: xhr.status,
              text: xhr.responseText,
            });
          };

          xhr.onerror = () => reject(new Error('Сетевая ошибка (проверьте VPN/прокси)'));
          xhr.ontimeout = () => reject(new Error('Таймаут соединения'));
          xhr.timeout = 0;

          xhr.send(formData);
        });
      }

      async function uploadRelease() {
        const token = document.getElementById('token').value.trim();
        const owner = document.getElementById('owner').value.trim();
        const repo = document.getElementById('repo').value.trim();
        const fileInput = document.getElementById('file');
        const btn = document.getElementById('uploadBtn');

        clearLog();

        if (!token || !owner || !repo) {
          log('Заполните Token, Owner и Repository', 'error');
          return;
        }
        if (!fileInput.files.length) {
          log('Выберите файл', 'error');
          return;
        }

        const file = fileInput.files[0];
        const MAX_SIZE = 2.2 * 1024 * 1024 * 1024;

        if (file.size > MAX_SIZE) {
          log(
            `Файл слишком большой (${(file.size / 1024 / 1024 / 1024).toFixed(2)} ГБ). Лимит GitHub — ≈ 2.2 ГБ`,
            'error'
          );
          return;
        }

        let tag, releaseName, filename;

        if (currentMode === 'manual') {
          tag = document.getElementById('customTag').value.trim();
          releaseName = document.getElementById('customName').value.trim();

          const baseName = document
            .getElementById('customFilename')
            .value.trim();
          const ext = document.getElementById('fileExt').textContent;
          filename = baseName + ext;

          if (!tag) {
            log('Укажите Tag', 'error');
            return;
          }
          if (!releaseName) {
            log('Укажите название релиза', 'error');
            return;
          }
          if (!baseName) {
            log('Укажите имя файла', 'error');
            return;
          }
        } else {
          tag = generateTag();
          releaseName = `Release ${tag}`;
          filename = file.name;
        }

        const apiUrl = `https://api.github.com/repos/${owner}/${repo}/releases`;
        const WORKER_URL =
          'https://zerocloud-upload.frozenjuggernaut.workers.dev/';

        btn.disabled = true;
        btn.innerHTML = 'Загрузка...';

        log(`Tag: ${tag}`, 'info');
        log(`Релиз: ${releaseName}`, 'info');
        log(`Файл: ${filename} (${(file.size / 1024 / 1024).toFixed(2)} МБ)`, 'info');
        log('Создаю релиз...', 'info');

        try {
          const createRes = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              Authorization: `token ${token}`,
              Accept: 'application/vnd.github+json',
              'X-GitHub-Api-Version': '2022-11-28',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              tag_name: tag,
              name: releaseName,
              body: `Релиз создан через Zerocloud`,
              draft: false,
              prerelease: false,
            }),
          });

          const responseText = await createRes.text();
          let data;
          try {
            data = JSON.parse(responseText);
          } catch (e) {
            data = responseText;
          }

          if (!createRes.ok) {
            log(
              `Ошибка ${createRes.status}: ${data.message || JSON.stringify(data)}`,
              'error'
            );
            throw new Error('create failed');
          }

          log(`Релиз создан`, 'success');
          log(data.html_url, 'success');

          const uploadUrl = data.upload_url.replace(
            '{?name,label}',
            `?name=${encodeURIComponent(filename)}`
          );

          const formData = new FormData();
          formData.append('token', token);
          formData.append('upload_url', uploadUrl);
          formData.append('file', file);

          const uploadRes = await uploadWithProgress(
            WORKER_URL,
            formData,
            (percent) => updateProgressLog(percent)
          );

          let asset;
          try {
            asset = JSON.parse(uploadRes.text);
          } catch (e) {
            asset = uploadRes.text;
          }

          if (!uploadRes.ok) {
            const errMsg =
              (asset && asset.message) ||
              (typeof asset === 'string' ? asset : JSON.stringify(asset));
            log(`Ошибка загрузки (${uploadRes.status}): ${errMsg}`, 'error');
            throw new Error('upload failed');
          }

          if (progressLogEntry) {
            progressLogEntry.className = 'log-entry success';
            progressLogEntry.querySelector('.log-icon').textContent = '✓';
            progressLogEntry.querySelector('.log-msg').textContent =
              'Файл загружен (100%)';
            progressLogEntry.querySelector('.log-msg').style.color = '#86efac';
          }

          log('Готово!', 'success');
          if (asset.browser_download_url) {
            log(asset.browser_download_url, 'success');
          }
        } catch (e) {
          if (e.message !== 'create failed' && e.message !== 'upload failed') {
            log('Ошибка: ' + e.message, 'error');
          }
        } finally {
          btn.disabled = false;
          btn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Загрузить и отправить
          `;
        }
      }