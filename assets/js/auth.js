// ===== PASSWORD HASHING =====
async function hashPassword(password) {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  } catch (e) {
    // Web Crypto unavailable (non-HTTPS, old browser)
    console.warn('[umeko] Web Crypto API unavailable.');
    return null; // Phase 5-2: never return plaintext
  }
}

// 戻り値: 'admin'（管理者）/ 'staff'（閲覧のみ）/ null（不一致）
async function checkPassword(input) {
  const config = getConfig();
  const storedHash = config.password_hash;
  // Legacy NOCRYPTO entries — still verify, but can't re-hash
  if (storedHash.startsWith('NOCRYPTO:')) {
    return storedHash === 'NOCRYPTO:' + input ? 'admin' : null;
  }
  const inputHash = await hashPassword(input);
  if (inputHash === null) return null; // crypto unavailable → deny
  if (inputHash === storedHash) return 'admin';
  if (inputHash === STAFF_PASSWORD_HASH) return 'staff';
  return null;
}

// ===== 権限（管理者／閲覧のみ）=====
function _setRole(role) {
  window.USER_ROLE = role;
  window.IS_ADMIN = role === 'admin';
}

// 編集操作の入口で呼ぶ。閲覧用パスワードで入った場合は操作させない
function requireAdmin() {
  if (window.IS_ADMIN) return true;
  showToast('閲覧専用のため、この操作はできません。', 'error');
  return false;
}

// ===== LOGIN OVERLAY AUTH (Phase 6-1: replaces prompt()) =====
async function initAuth() {
  const overlay = document.getElementById('login-overlay');

  // Already authenticated in this session（'ok' は権限分け以前の管理者ログイン）
  const saved = sessionStorage.getItem('umeko_auth');
  if (saved === 'admin' || saved === 'staff' || saved === 'ok') {
    _setRole(saved === 'staff' ? 'staff' : 'admin');
    if (overlay) overlay.style.display = 'none';
    return true;
  }

  // Web Crypto check
  if (!crypto || !crypto.subtle) {
    _showOverlayError(
      'このページはHTTPS環境でのみ利用できます。<br>' +
      'GitHub PagesのURLからアクセスしてください。'
    );
    _disableLoginForm();
    return false;
  }

  // Show overlay and await correct password
  return _awaitLogin();
}

function _awaitLogin() {
  return new Promise((resolve) => {
    const overlay  = document.getElementById('login-overlay');
    const btn      = document.getElementById('login-btn');
    const input    = document.getElementById('login-password');

    if (overlay) overlay.style.display = 'flex';
    if (input)   setTimeout(() => input.focus(), 80);

    let attempts = 0;

    async function tryLogin() {
      const password = input ? input.value : '';
      if (!password) {
        _showOverlayError('パスワードを入力してください。');
        return;
      }

      if (btn) { btn.disabled = true; btn.textContent = '確認中…'; }
      _clearOverlayError();

      const role = await checkPassword(password);

      if (role) {
        _setRole(role);
        sessionStorage.setItem('umeko_auth', role);
        if (overlay) overlay.style.display = 'none';
        resolve(true);
        return;
      }

      // Wrong password
      attempts++;
      if (input) { input.value = ''; input.focus(); }
      if (btn) { btn.disabled = false; btn.textContent = 'ログイン'; }

      if (attempts >= 3) {
        _showOverlayError('パスワードが違います。生徒用ページへ戻ります…');
        setTimeout(() => { location.href = 'index.html'; }, 1500);
        resolve(false);
      } else {
        _showOverlayError(`パスワードが違います。（あと${3 - attempts}回入力できます）`);
      }
    }

    if (btn)   btn.addEventListener('click', tryLogin);
    if (input) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryLogin(); });
  });
}

function _showOverlayError(message) {
  const el = document.getElementById('login-error');
  if (el) { el.innerHTML = message; el.style.display = 'block'; }
}

function _clearOverlayError() {
  const el = document.getElementById('login-error');
  if (el) { el.innerHTML = ''; el.style.display = 'none'; }
}

function _disableLoginForm() {
  const btn   = document.getElementById('login-btn');
  const input = document.getElementById('login-password');
  if (btn)   btn.disabled = true;
  if (input) input.disabled = true;
}

// ===== PASSWORD CHANGE (Phase 5-2: block plaintext storage) =====
async function changePassword(newPassword) {
  if (!requireAdmin()) return false;
  // Phase 5-2: NOCRYPTO environments must not store plaintext
  if (!crypto || !crypto.subtle) {
    showToast('HTTPS環境でのみパスワードを変更できます。', 'error');
    return false;
  }
  if (!newPassword || newPassword.length < 4) {
    showToast('パスワードは4文字以上で入力してください。', 'error');
    return false;
  }
  const hash = await hashPassword(newPassword);
  if (!hash) {
    showToast('パスワードのハッシュ化に失敗しました。', 'error');
    return false;
  }
  if (hash === STAFF_PASSWORD_HASH) {
    showToast('閲覧用パスワードと同じものは設定できません。', 'error');
    return false;
  }
  const config = getConfig();
  config.password_hash = hash;
  saveConfig(config);
  showToast('パスワードを変更しました。', 'success');
  return true;
}
