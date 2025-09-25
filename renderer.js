window.addEventListener('DOMContentLoaded', () => {
  // checkRole();
  const wrapper = document.getElementById('accountsWrapper');

  // 1️⃣ Load config từ localStorage
  const cfg = JSON.parse(localStorage.getItem('veo3Config') || '{}');

  // Dark mode
  if (cfg.darkMode) document.body.classList.add('dark');

  // Load accounts
  if (Array.isArray(cfg.accounts)) {
  cfg.accounts.forEach((acc, i) => {
    let div;

    if (i === 0) {
      // Account 1 đã có sẵn div trong HTML
      div = wrapper.querySelector('.accountInput');
      div.querySelector('input[type="text"]').value = acc;
    } else {
      // tạo mới account từ account2 trở đi
      div = document.createElement('div');
      div.className = 'accountInput';
      div.innerHTML = `
        <input type="radio" name="selectedAccount" class="accountRadio" />
        <input type="text" placeholder="Tên Account ${i+1}" value="${acc}" />
        <button class="removeAccount">❌</button>
      `;
      wrapper.appendChild(div);
    }

    // Nếu account chưa có radio (account1)
    if (!div.querySelector('.accountRadio')) {
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'selectedAccount';
      radio.className = 'accountRadio';
      div.prepend(radio);
    }
  });
}

  document.querySelector('.numberVideos').value = cfg[`numberVideos`]
  addRemoveHandlers();

  const adminTabBtn = document.getElementById("adminTabBtn");
  if (adminTabBtn) adminTabBtn.addEventListener("click", loadUsers);
  document.getElementById("addUserBtn").addEventListener("click", () => showUserForm());
  document.getElementById("cancelUserBtn").addEventListener("click", hideUserForm);
  document.getElementById("saveUserBtn").addEventListener("click", saveUser);
  
});


// Dark mode
document.getElementById('toggleDark').addEventListener('click', () => {
  document.body.classList.toggle('dark');
  const dark = document.body.classList.contains('dark');
  const cfg = JSON.parse(localStorage.getItem('veo3Config') || '{}');
  cfg.darkMode = dark;
  localStorage.setItem('veo3Config', JSON.stringify(cfg));
});

// Add account dynamically
document.getElementById('addAccount').addEventListener('click', () => {
  const wrapper = document.getElementById('accountsWrapper');
  const count = wrapper.querySelectorAll('input[type="text"]').length + 1;
  const div = document.createElement('div');
  div.className = 'accountInput';
  div.innerHTML = `
    <input type="radio" name="selectedAccount" class="accountRadio" />
    <input type="text" placeholder="Tên Account ${count}" />
    <button class="removeAccount">❌</button>
  `;
  wrapper.appendChild(div);
  addRemoveHandlers();
});

// Remove account
function addRemoveHandlers() {
  document.querySelectorAll('.removeAccount').forEach(btn => {
    btn.onclick = () => {
      btn.parentElement.remove();
    };
  });
}


function saveConfigFromUI() {
  const cfg = {
    darkMode: document.body.classList.contains('dark'),
    numberVideos: parseInt(document.querySelector('.numberVideos').value) || 2,
    accounts: []
  };

  document.querySelectorAll('#accountsWrapper input[type="text"]').forEach((inp, i) => {
    if (inp.value.trim()) {
      cfg.accounts.push(inp.value.trim());
    }
  });

  localStorage.setItem('veo3Config', JSON.stringify(cfg));
  console.log('Config saved:', cfg);

  try {
    const filePath = window.electronAPI.saveConfig(cfg);
    console.log("Config saved to file:", filePath);
  } catch (err) {
    console.error('Error saving config to file:', err);
  }
}


document.getElementById('saveConfig').addEventListener('click', () => {
  saveConfigFromUI();
  alert('Đã lưu cấu hình!');
});

// Login selected account
document.getElementById('loginAccount').addEventListener('click', async () => {
  const accountDivs = document.querySelectorAll('#accountsWrapper .accountInput');
  let selectedAccount = null;

  accountDivs.forEach(div => {
    const radio = div.querySelector('.accountRadio'); // radio duy nhất
    const input = div.querySelector('input[type="text"]');
    if (radio.checked && input.value.trim()) {
      selectedAccount = input.value.trim();
    }
  });

  if (!selectedAccount) {
    alert('Vui lòng chọn 1 account và điền tên!');
    return;
  }

  saveConfigFromUI();

  try {
    await window.electronAPI.loginAccount({ accountName: selectedAccount });
    alert(`Login thành công: ${selectedAccount}`);
  } catch (err) {
    alert(`Login thất bại: ${selectedAccount}\n${err.message || err}`);
  }
});


// Import Excel Video
document.getElementById('importExcel').addEventListener('click', async () => {
  const data = await window.electronAPI.openExcel();
  if (!data || !data.length) return;

  const container = document.getElementById('excelContainer');
  container.innerHTML = '';

  const table = document.createElement('table');
  const header = document.createElement('tr');
  header.innerHTML = `<th style="border:1px solid #ccc;padding:4px">Prompt</th>`;
  table.appendChild(header);

  data.forEach(row => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td style="border:1px solid #ccc;padding:4px">${row.prompt}</td>`;
    table.appendChild(tr);
  });

  container.appendChild(table);
  container.hidden = false;
  container.dataset.queue = JSON.stringify(data);
  document.querySelector('.tablinks[onclick*="queueTab"]').click();
});



// Import Excel Image
document.getElementById('importExcelImg').addEventListener('click', async () => {
  const data = await window.electronAPI.openExcel();
  if (!data || !data.length) return;

  const container = document.getElementById('excelContainerImg');
  container.innerHTML = '';

  const table = document.createElement('table');
  const header = document.createElement('tr');
  header.innerHTML = `<th style="border:1px solid #ccc;padding:4px">Prompt</th>`;
  table.appendChild(header);

  data.forEach(row => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td style="border:1px solid #ccc;padding:4px">${row.prompt}</td>`;
    table.appendChild(tr);
  });

  container.appendChild(table);
  container.hidden = false;
  container.dataset.queue = JSON.stringify(data);
  document.querySelector('.tablinks[onclick*="queueTab"]').click();
});



// Generate Videos
document.getElementById('generate').addEventListener('click', async () => {
  const container = document.getElementById('excelContainer');
  const queue = JSON.parse(container.dataset.queue || '[]');
  if (!queue.length) { alert('Chưa có dữ liệu import!'); return; }

  const inputs = document.querySelectorAll('#accountsWrapper input[type="text"]');
  const accounts = [];
  inputs.forEach((inp, i) => {
    if (inp.value) accounts.push({ name: inp.value.trim() || `Account${i + 1}` });
  });
  if (!accounts.length) { alert('Chưa có account!'); return; }

  const progressContainer = document.getElementById('progressContainer');
  progressContainer.innerHTML = '';

  accounts.forEach(a => {
    const div = document.createElement('div');
    div.className = 'accountProgress';
    div.innerHTML = `<h4>${a.name}</h4><progress id="bar-${a.name}" value="0" max="100"></progress>`;
    progressContainer.appendChild(div);
  });

  const resultLog = document.getElementById('result');
  resultLog.innerHTML = '';

  try {
    await window.electronAPI.generateVideos({ accounts, queue });
  } catch (err) {
    alert('Lỗi generate: ' + (err.message || err));
  }
});

// Generate Image
document.getElementById('generateImg').addEventListener('click', async () => {
  const container = document.getElementById('excelContainerImg');
  console.log("container ==" + container);
  
  const queue = JSON.parse(container.dataset.queue || '[]');
  if (!queue.length) { alert('Chưa có dữ liệu import!'); return; }

  const inputs = document.querySelectorAll('#accountsWrapper input[type="text"]');
  const accounts = [];
  inputs.forEach((inp, i) => {
    if (inp.value) accounts.push({ name: inp.value.trim() || `Account${i + 1}` });
  });
  if (!accounts.length) { alert('Chưa có account!'); return; }

  const progressContainer = document.getElementById('progressContainerImg');
  progressContainer.innerHTML = '';

  accounts.forEach(a => {
    const div = document.createElement('div');
    div.className = 'accountProgress';
    div.innerHTML = `<h4>${a.name}</h4><progress id="bar-${a.name}" value="0" max="100"></progress>`;
    progressContainer.appendChild(div);
  });

  const resultLog = document.getElementById('resultImg');
  resultLog.innerHTML = '';

  try {
    await window.electronAPI.generateImage({ accounts, queue });
  } catch (err) {
    alert('Lỗi generate: ' + (err.message || err));
  }
});


// Nhận tiến trình từng video
window.electronAPI.onProgress((event, prog) => {
  const percent = Math.floor((prog.index / prog.total) * 100);
  const bar = document.getElementById(`bar-${prog.account.name}`);
  if (bar) bar.value = percent;

  const log = document.getElementById('result');
  if (prog.step === 'downloading') {
    log.innerHTML += `<p>⬇️ [${prog.account}] ${prog.index}/${prog.total} Bắt đầu tải: ${prog.prompt}</p>`;
  } else if (prog.step === 'fast') {
    log.innerHTML += `<p>⚡ [${prog.account}] ${prog.index}/${prog.total} Fast done: ${prog.file || ''}</p>`;
  }  else if (prog.step === 'error') {
    log.innerHTML += `<p>❌ [${prog.account}] ${prog.index}/${prog.total} Error: ${prog.error}</p>`;
  }
  log.scrollTop = log.scrollHeight;
});

window.electronAPI.onProgressImg((event, prog) => {
  const percent = Math.floor((prog.index / prog.total) * 100);
  const bar = document.getElementById(`bar-${prog.account.name}`);
  if (bar) bar.value = percent;

  const log = document.getElementById('resultImg');
  if (prog.step === 'downloading') {
    log.innerHTML += `<p>⬇️ [${prog.account}] Bắt đầu tải ảnh từ ImageFX</p>`;
  } else if (prog.step === 'fast') {
    log.innerHTML += `<p>⚡ [${prog.account}] Image Download done: Pictures\\Image-FX}</p>`;
  }  else if (prog.step === 'error') {
    log.innerHTML += `<p>❌ [${prog.account}] ${prog.index}/${prog.total} Error: ${prog.error}</p>`;
  }
  log.scrollTop = log.scrollHeight;
});

// Xóa log + progress khi clear
window.electronAPI.onClearProgress(() => {
  document.getElementById('progressContainer').innerHTML = '';
  document.getElementById('result').innerHTML = '';
});

// Nhận kết quả cuối cùng sau khi xong 1 account
window.electronAPI.onDone((event, data) => {
  const log = document.getElementById('result');
  const success = data.results.filter(r => r.status === "success").length;
  const failed = data.results.filter(r => r.status === "error").length;

  log.innerHTML += `
    <hr />
    <p>📊 [${data.account.name}] Hoàn tất!</p>
    <p>✅ Thành công: ${success}</p>
    <p>❌ Lỗi: ${failed}</p>
    <hr />
  `;
  log.scrollTop = log.scrollHeight;
});

window.electronAPI.onDoneImg((event, data) => {
  const log = document.getElementById('resultImg');
  const success = data.results.filter(r => r.status === "success").length;
  const failed = data.results.filter(r => r.status === "error").length;

  log.innerHTML += `
    <hr />
    <p>📊 [${data.account.name}] Hoàn tất!</p>
    <p>✅ Thành công: ${success}</p>
    <p>❌ Lỗi: ${failed}</p>
    <hr />
  `;
  log.scrollTop = log.scrollHeight;
});


function openTab(evt, tabName) {
  const tabcontent = document.getElementsByClassName("tabcontent");
  for (let i = 0; i < tabcontent.length; i++) tabcontent[i].style.display = "none";

  const tablinks = document.getElementsByClassName("tablinks");
  for (let i = 0; i < tablinks.length; i++) tablinks[i].classList.remove("active");

  document.getElementById(tabName).style.display = "block";
  evt.currentTarget.classList.add("active");
}

// Kiểm tra role
async function checkRole() {
  const user = await window.electronAPI.getCurrentUser();
  const adminTabBtn = document.getElementById("adminTabBtn");
  const userTab = document.getElementById("userTab");

  if (!user || user.role !== "admin") {
    adminTabBtn.style.display = "none";
    userTab.style.display = "none";
  } else {
    adminTabBtn.style.display = "inline-block";
    userTab.style.display = "none";
  }
}

// Load user list
async function loadUsers() {
  const users = await window.electronAPI.getUsers();
  const userListDiv = document.getElementById("userList");

  if (users.length === 0) {
    userListDiv.innerHTML = "<i>Không có user nào</i>";
    return;
  }

  // Tạo table
  let html = `
    <table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; width: 100%;">
      <thead>
        <tr style="background-color: #f2f2f2;">
          <th>Tên đăng nhập</th>
          <th>Role</th>
          <th>Trạng thái</th>
          <th>Hành động</th>
        </tr>
      </thead>
      <tbody>
  `;

  users.forEach(u => {
    html += `
      <tr>
        <td>${u.username}</td>
        <td>${u.role}</td>
        <td>${u.status}</td>
        <td>
          <button class="btn delete-btn" data-id="${u.id}">Xóa</button>
        </td>
      </tr>
    `;
  });

  html += "</tbody></table>";
  userListDiv.innerHTML = html;

  // Gắn event listener cho nút Sửa
  userListDiv.querySelectorAll(".edit-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const username = btn.dataset.username;
      const role = btn.dataset.role;
      editUser(id, username, role);
    });
  });

  // Gắn event listener cho nút Xóa
  userListDiv.querySelectorAll(".delete-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      deleteUser(id);
    });
  });
}


// let editUserId = null;
function showUserForm(user = null) {
  let editUserId = user?.id || null;
  const wrapper = document.getElementById("userFormWrapper");
  wrapper.style.display = "block";

  document.getElementById("formTitle").innerText = user ? "Sửa user" : "Thêm user";
  document.getElementById("formUsername").value = user?.username || "";
  document.getElementById("formPassword").value = "";
  document.getElementById("formRole").value = user?.role || "user";
}

function hideUserForm() {
  document.getElementById("userFormWrapper").style.display = "none";
}


// Thêm user từ nút Add
document.getElementById("addUserBtn")?.addEventListener("click", () => showUserForm());

// Hủy form
document.getElementById("cancelUserBtn")?.addEventListener("click", hideUserForm);


async function saveUser() {
  const username = document.getElementById("formUsername").value.trim();
  const password = document.getElementById("formPassword").value;
  const role = document.getElementById("formRole").value;

  if (!username || !password) {
    const errorEl = document.getElementById("errorMessage");
    errorEl.innerText = "Username và password bắt buộc!";
    // alert("Username và password bắt buộc!");
    return;
  }

  // Thêm user (hoặc sửa user nếu có editUserId)
  const result = await window.electronAPI.addUser({ username, password, role });

  if (result.success) {
    hideUserForm();
    loadUsers();
  } else {
    alert(result.message);
  }
}

// Gắn sự kiện sau khi hàm đã được định nghĩa
document.getElementById("saveUserBtn").addEventListener("click", saveUser);


// Sửa user từ bảng
function editUser(id, username, role) {
  showUserForm({ id, username, role });
}

// Xóa user từ bảng
async function deleteUser(id) {
  if (!confirm("Bạn có chắc muốn xóa user này?")) return;

  const result = await window.electronAPI.deleteUser({ id });
  if (result.success) loadUsers();
  else alert(result.message);
}

// Gán ra window để các nút trong table gọi được
window.addUser = () => showUserForm();
window.editUser = editUser;
window.deleteUser = deleteUser;
