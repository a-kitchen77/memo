// ========================================
// memo - メモアプリ (IndexedDB版)
// ========================================

// Dexieデータベース初期化
const db = new Dexie('MemoDB');
db.version(1).stores({
  folders: 'id, name, createdAt, updatedAt',
  memos: 'id, folderId, title, createdAt, updatedAt'
});

// ========================================
// データ管理（非同期版）
// ========================================
const Store = {
  // ユニークID生成
  generateId() {
    return Date.now().toString() + '_' + Math.random().toString(36).substr(2, 9);
  },

  // フォルダ操作
  async getFolders() {
    return await db.folders.toArray();
  },

  async addFolder(name) {
    const now = new Date().toISOString();
    const folder = {
      id: this.generateId(),
      name,
      createdAt: now,
      updatedAt: now
    };
    await db.folders.add(folder);
    return folder;
  },

  async deleteFolder(folderId) {
    await db.folders.delete(folderId);
    // フォルダ内のメモも削除
    await db.memos.where('folderId').equals(folderId).delete();
  },

  async updateFolder(id, name) {
    await db.folders.update(id, {
      name,
      updatedAt: new Date().toISOString()
    });
  },

  async updateFolderTimestamp(folderId) {
    await db.folders.update(folderId, { updatedAt: new Date().toISOString() });
  },

  // メモ操作
  async getMemos() {
    return await db.memos.toArray();
  },

  async addMemo(memo) {
    const now = new Date().toISOString();
    const newMemo = {
      id: this.generateId(),
      ...memo,
      createdAt: now,
      updatedAt: now
    };
    await db.memos.add(newMemo);
    // フォルダの更新日時も更新
    await this.updateFolderTimestamp(memo.folderId);
    return newMemo;
  },

  async updateMemo(id, updates) {
    const updateData = { ...updates, updatedAt: new Date().toISOString() };
    await db.memos.update(id, updateData);
    if (updates.folderId) {
      await this.updateFolderTimestamp(updates.folderId);
    }
    return await db.memos.get(id);
  },

  async deleteMemo(id) {
    await db.memos.delete(id);
  },

  async getMemosByFolder(folderId) {
    const memos = await db.memos.where('folderId').equals(folderId).toArray();
    return memos.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  },

  async searchMemos(query) {
    const q = query.toLowerCase();
    const memos = await db.memos.toArray();
    return memos.filter(m =>
      (m.title && m.title.toLowerCase().includes(q)) ||
      (m.content && m.content.toLowerCase().includes(q))
    ).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  },

  // バックアップ/復元
  async exportAllData() {
    const folders = await this.getFolders();
    const memos = await this.getMemos();
    return { folders, memos, exportedAt: new Date().toISOString() };
  },

  async importData(data) {
    // 既存データをクリア
    await db.folders.clear();
    await db.memos.clear();
    // 新しいデータを追加
    if (data.folders && data.folders.length > 0) {
      await db.folders.bulkAdd(data.folders);
    }
    if (data.memos && data.memos.length > 0) {
      await db.memos.bulkAdd(data.memos);
    }
  },

  async clearAllData() {
    await db.folders.clear();
    await db.memos.clear();
  }
};

// ========================================
// LocalStorage → IndexedDB 移行
// ========================================
async function migrateFromLocalStorage() {
  const oldFolders = localStorage.getItem('ayumemo_folders');
  const oldMemos = localStorage.getItem('ayumemo_memos');

  if (oldFolders || oldMemos) {
    console.log('LocalStorageからデータを移行中...');
    try {
      if (oldFolders) {
        const folders = JSON.parse(oldFolders);
        for (const folder of folders) {
          await db.folders.put(folder);
        }
      }
      if (oldMemos) {
        const memos = JSON.parse(oldMemos);
        for (const memo of memos) {
          await db.memos.put(memo);
        }
      }
      // 移行完了後、LocalStorageをクリア
      localStorage.removeItem('ayumemo_folders');
      localStorage.removeItem('ayumemo_memos');
      console.log('データ移行完了');
    } catch (e) {
      console.error('データ移行エラー:', e);
    }
  }
}

// 未分類フォルダのIDを取得または作成
async function getOrCreateUncategorizedFolder() {
  const folders = await Store.getFolders();
  let uncategorized = folders.find(f => f.name === '未分類');
  if (!uncategorized) {
    uncategorized = await Store.addFolder('未分類');
  }
  return uncategorized;
}

// 初期データ
async function initializeData() {
  const folders = await Store.getFolders();
  if (folders.length === 0) {
    await Store.addFolder('未分類');
    await Store.addFolder('メモ');
    await Store.addFolder('仕事');
    await Store.addFolder('プライベート');
  }
}

// ========================================
// DOM要素
// ========================================
const elements = {
  folderList: document.getElementById('folderList'),
  newMemoBtn: document.getElementById('newMemoBtn'),
  addFolderBtn: document.getElementById('addFolderBtn'),
  globalSearch: document.getElementById('globalSearch'),
  clearSearch: document.getElementById('clearSearch'),
  searchResults: document.getElementById('searchResults'),
  searchResultsList: document.getElementById('searchResultsList'),

  // 設定
  settingsBtn: document.getElementById('settingsBtn'),
  settingsModal: document.getElementById('settingsModal'),
  closeSettings: document.getElementById('closeSettings'),
  backupBtn: document.getElementById('backupBtn'),
  restoreFile: document.getElementById('restoreFile'),
  resetDataBtn: document.getElementById('resetDataBtn'),

  // エディタモーダル
  editorModal: document.getElementById('editorModal'),
  closeEditor: document.getElementById('closeEditor'),
  folderSelect: document.getElementById('folderSelect'),
  memoTitle: document.getElementById('memoTitle'),
  memoContent: document.getElementById('memoContent'),
  charCount: document.getElementById('charCount'),
  exportBtn: document.getElementById('exportBtn'),
  deleteBtn: document.getElementById('deleteBtn'),

  // インラインフォルダ作成
  addFolderInlineBtn: document.getElementById('addFolderInlineBtn'),
  inlineFolderCreate: document.getElementById('inlineFolderCreate'),
  inlineFolderName: document.getElementById('inlineFolderName'),
  confirmInlineFolder: document.getElementById('confirmInlineFolder'),
  cancelInlineFolder: document.getElementById('cancelInlineFolder'),

  // 検索・置換
  toggleSearchReplace: document.getElementById('toggleSearchReplace'),
  searchReplacePanel: document.getElementById('searchReplacePanel'),
  searchText: document.getElementById('searchText'),
  replaceText: document.getElementById('replaceText'),
  findNextBtn: document.getElementById('findNextBtn'),
  replaceBtn: document.getElementById('replaceBtn'),
  replaceAllBtn: document.getElementById('replaceAllBtn'),
  searchInfo: document.getElementById('searchInfo'),

  // フォルダモーダル
  folderModal: document.getElementById('folderModal'),
  folderName: document.getElementById('folderName'),
  cancelFolder: document.getElementById('cancelFolder'),
  confirmFolder: document.getElementById('confirmFolder'),

  // 確認モーダル
  confirmModal: document.getElementById('confirmModal'),
  confirmTitle: document.getElementById('confirmTitle'),
  confirmMessage: document.getElementById('confirmMessage'),
  confirmCancel: document.getElementById('confirmCancel'),
  confirmOk: document.getElementById('confirmOk'),

  // Markdownツールバー
  insertH2Btn: document.getElementById('insertH2Btn'),
  insertH3Btn: document.getElementById('insertH3Btn'),
  insertBoldBtn: document.getElementById('insertBoldBtn'),
  insertListBtn: document.getElementById('insertListBtn'),
  // insertCheckboxBtn: document.getElementById('insertCheckboxBtn'), // Removed

  // フェーズ3追加
  insertH1Btn: document.getElementById('insertH1Btn'),
  insertQuoteBtn: document.getElementById('insertQuoteBtn'),
  insertHrBtn: document.getElementById('insertHrBtn'),

  // New Buttons
  undoBtn: document.getElementById('undoBtn'),

  markdownHelpBtn: document.getElementById('markdownHelpBtn'),
  markdownHelpModal: document.getElementById('markdownHelpModal'),
  closeMarkdownHelp: document.getElementById('closeMarkdownHelp'),

  // 編集/プレビュー切り替え
  editTabBtn: document.getElementById('editTabBtn'),
  previewTabBtn: document.getElementById('previewTabBtn'),
  previewArea: document.getElementById('previewArea'),

  // フェーズ2
  // editorFixedGroup: document.getElementById('editorFixedGroup'), // Removed in Flexbox refactor
  headerArea: document.getElementById('headerArea'),
  toggleHeaderBtn: document.getElementById('toggleHeaderBtn'),
  importFile: document.getElementById('importFile'),
  saveBtn: document.getElementById('saveBtn'),
  toastNotification: document.getElementById('toastNotification'),
  toastMessage: document.getElementById('toastMessage')
};

// 状態
let currentMemoId = null;
let isHeaderCollapsed = false;
let openFolders = new Set();
let searchMatchIndex = 0;
let searchMatches = [];
let confirmCallback = null;
let isPreviewMode = false;
let editingFolderId = null; // null:新規作成, ID string:編集

// ========================================
// 描画関数
// ========================================
async function renderFolders() {
  // フォルダを更新日時順（最新が上）にソート
  const folders = (await Store.getFolders()).sort((a, b) => {
    const dateA = new Date(a.updatedAt || a.createdAt || 0);
    const dateB = new Date(b.updatedAt || b.createdAt || 0);
    return dateB - dateA;
  });

  let html = '';
  for (const folder of folders) {
    const memos = await Store.getMemosByFolder(folder.id);
    const isOpen = openFolders.has(folder.id);

    html += `
      <div class="mb-3" data-folder-id="${folder.id}">
        <div class="bg-ios-card rounded-xl shadow-ios overflow-hidden">
          <div 
            class="flex items-center justify-between px-4 py-3.5 cursor-pointer active:bg-gray-50"
            onclick="toggleFolder('${folder.id}')"
          >
            <div class="flex items-center gap-3">
              <span class="text-xl">📁</span>
              <span class="font-semibold text-gray-800">${escapeHtml(folder.name)}</span>
              <span class="text-sm text-ios-gray">${memos.length}</span>
            </div>
            <div class="flex items-center gap-1">
              <button 
                class="p-2 text-ios-gray hover:text-ios-blue transition-colors"
                onclick="event.stopPropagation(); editFolder('${folder.id}', '${escapeHtml(folder.name)}')"
                title="名前を変更"
              >
                ✏️
              </button>
              <button 
                class="p-2 text-ios-gray hover:text-red-500 transition-colors"
                onclick="event.stopPropagation(); deleteFolder('${folder.id}')"
                title="フォルダを削除"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                </svg>
              </button>
              <svg class="w-5 h-5 text-ios-gray folder-arrow ${isOpen ? 'open' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
              </svg>
            </div>
          </div>
          
          <div class="accordion-content ${isOpen ? 'open' : ''}">
            <div class="border-t border-ios-separator">
              ${memos.length > 0 ? memos.map((memo, index) => renderMemoCard(memo, index === memos.length - 1)).join('') : `
                <div class="px-4 py-6 text-center text-ios-gray text-sm">
                  メモがありません
                </div>
              `}
              <button 
                class="w-full px-4 py-3 text-ios-blue text-sm font-medium text-center border-t border-ios-separator active:bg-gray-50"
                onclick="openEditorForFolder('${folder.id}')"
              >
                ＋ このフォルダに追加
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  elements.folderList.innerHTML = html;

  if (folders.length === 0) {
    elements.folderList.innerHTML = `
      <div class="text-center py-12 text-ios-gray">
        <p class="text-lg mb-2">フォルダがありません</p>
        <p class="text-sm">右下のボタンからフォルダを作成してください</p>
      </div>
    `;
  }
}

// メモカードを描画
function renderMemoCard(memo, isLast) {
  const lines = (memo.content || '').split('\n').filter(l => l.trim());
  let line1, line2;

  if (memo.title && memo.title.trim()) {
    line1 = memo.title;
    line2 = lines[0] || '';
  } else {
    line1 = lines[0] || '無題のメモ';
    line2 = lines[1] || '';
  }

  const updatedAt = formatDate(memo.updatedAt || memo.createdAt);

  return `
    <div 
      class="memo-card px-4 py-3 cursor-pointer ${!isLast ? 'border-b border-ios-separator' : ''}"
      onclick="openMemo('${memo.id}')"
    >
      <div class="flex items-center justify-between gap-2">
        <div class="font-semibold text-gray-800 truncate flex-1">${escapeHtml(line1)}</div>
        <div class="text-xs text-ios-lightGray whitespace-nowrap">${updatedAt}</div>
      </div>
      <div class="text-sm text-ios-gray truncate mt-0.5">${escapeHtml(line2) || '&nbsp;'}</div>
    </div>
  `;
}

// フォルダの開閉
function toggleFolder(folderId) {
  if (openFolders.has(folderId)) {
    openFolders.delete(folderId);
  } else {
    openFolders.add(folderId);
  }
  renderFolders();
}

// フォルダ選択を更新
async function updateFolderSelect(selectedId = '') {
  const folders = await Store.getFolders();
  elements.folderSelect.innerHTML = `
    <option value="">フォルダを選択...</option>
    ${folders.map(f => `
      <option value="${f.id}" ${f.id === selectedId ? 'selected' : ''}>${escapeHtml(f.name)}</option>
    `).join('')}
  `;
}

// ========================================
// エディタ操作
// ========================================
async function openEditor() {
  currentMemoId = null;
  elements.memoTitle.value = '';
  elements.memoContent.value = '';
  updateCharCount();
  await updateFolderSelect();
  elements.deleteBtn.classList.add('hidden');
  elements.searchReplacePanel.classList.remove('open');
  elements.inlineFolderCreate.classList.add('hidden');
  elements.editorModal.classList.add('open');
}

// 特定のフォルダにメモを追加
async function openEditorForFolder(folderId) {
  currentMemoId = null;
  elements.memoTitle.value = '';
  elements.memoContent.value = '';
  updateCharCount();
  await updateFolderSelect(folderId);
  elements.deleteBtn.classList.add('hidden');
  elements.searchReplacePanel.classList.remove('open');
  elements.inlineFolderCreate.classList.add('hidden');
  elements.editorModal.classList.add('open');
}

// メモを開く（編集）
async function openMemo(memoId) {
  const memos = await Store.getMemos();
  const memo = memos.find(m => m.id === memoId);
  if (!memo) return;

  currentMemoId = memoId;
  elements.memoTitle.value = memo.title || '';
  elements.memoContent.value = memo.content || '';
  updateCharCount();
  await updateFolderSelect(memo.folderId);
  elements.deleteBtn.classList.remove('hidden');
  elements.searchReplacePanel.classList.remove('open');
  elements.inlineFolderCreate.classList.add('hidden');
  elements.editorModal.classList.add('open');
}

// エディタを閉じる
async function closeEditor() {
  // 自動保存
  let folderId = elements.folderSelect.value;
  const title = elements.memoTitle.value.trim();
  const content = elements.memoContent.value;

  // フォルダ未選択の場合は「未分類」に保存
  if (!folderId && (title || content.trim())) {
    const uncategorized = await getOrCreateUncategorizedFolder();
    folderId = uncategorized.id;
  }

  if (folderId && (title || content.trim())) {
    if (currentMemoId) {
      await Store.updateMemo(currentMemoId, { folderId, title, content });
    } else {
      await Store.addMemo({ folderId, title, content });
    }
    await renderFolders();
    await renderSearchResults();
  }

  elements.editorModal.classList.remove('open');
}

// 文字数カウント
function updateCharCount() {
  const count = elements.memoContent.value.length;
  elements.charCount.textContent = `${count.toLocaleString()} 文字`;
}

// ========================================
// 検索・置換
// ========================================
function toggleSearchReplace() {
  elements.searchReplacePanel.classList.toggle('open');
  if (elements.searchReplacePanel.classList.contains('open')) {
    elements.searchText.focus();
  }
}

function findMatches() {
  const query = elements.searchText.value;
  const content = elements.memoContent.value;

  if (!query) {
    searchMatches = [];
    elements.searchInfo.textContent = '';
    return;
  }

  searchMatches = [];
  let index = 0;
  const lowerContent = content.toLowerCase();
  const lowerQuery = query.toLowerCase();

  while ((index = lowerContent.indexOf(lowerQuery, index)) !== -1) {
    searchMatches.push(index);
    index += query.length;
  }

  if (searchMatches.length > 0) {
    searchMatchIndex = 0;
    elements.searchInfo.textContent = `${searchMatchIndex + 1} / ${searchMatches.length} 件`;
    highlightMatch();
  } else {
    elements.searchInfo.textContent = '見つかりませんでした';
  }
}

function findNext() {
  if (searchMatches.length === 0) {
    findMatches();
    return;
  }

  searchMatchIndex = (searchMatchIndex + 1) % searchMatches.length;
  elements.searchInfo.textContent = `${searchMatchIndex + 1} / ${searchMatches.length} 件`;
  highlightMatch();
}

function highlightMatch() {
  if (searchMatches.length === 0) return;

  const pos = searchMatches[searchMatchIndex];
  const len = elements.searchText.value.length;
  elements.memoContent.focus();
  elements.memoContent.setSelectionRange(pos, pos + len);
}

function replaceOne() {
  const query = elements.searchText.value;
  const replacement = elements.replaceText.value;

  if (!query || searchMatches.length === 0) return;

  const content = elements.memoContent.value;
  const pos = searchMatches[searchMatchIndex];

  elements.memoContent.value =
    content.substring(0, pos) +
    replacement +
    content.substring(pos + query.length);

  updateCharCount();
  findMatches();
}

function replaceAll() {
  const query = elements.searchText.value;
  const replacement = elements.replaceText.value;

  if (!query) return;

  const regex = new RegExp(escapeRegex(query), 'gi');
  elements.memoContent.value = elements.memoContent.value.replace(regex, replacement);

  updateCharCount();
  findMatches();
  elements.searchInfo.textContent = 'すべて置換しました';
}

// ========================================
// メモエクスポート
// ========================================
function exportMemo() {
  const title = elements.memoTitle.value.trim() || '無題のメモ';
  const content = elements.memoContent.value;

  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `${title}.md`;
  a.click();

  URL.revokeObjectURL(url);
}

// ========================================
// 削除操作
// ========================================
async function deleteMemo() {
  if (!currentMemoId) return;

  showConfirm('メモを削除', 'このメモを削除しますか？', async () => {
    await Store.deleteMemo(currentMemoId);
    elements.editorModal.classList.remove('open');
    await renderFolders();
    await renderSearchResults();
  });
}

async function deleteFolder(folderId) {
  const folders = await Store.getFolders();
  const folder = folders.find(f => f.id === folderId);
  const memos = await Store.getMemosByFolder(folderId);

  showConfirm(
    'フォルダを削除',
    `「${folder.name}」を削除しますか？${memos.length > 0 ? `\n（${memos.length}件のメモも削除されます）` : ''}`,
    async () => {
      await Store.deleteFolder(folderId);
      openFolders.delete(folderId);
      await renderFolders();
    }
  );
}

function showConfirm(title, message, callback) {
  elements.confirmTitle.textContent = title;
  elements.confirmMessage.textContent = message;
  confirmCallback = callback;
  elements.confirmModal.classList.add('open');
}

// ========================================
// フォルダモーダル
// ========================================
function showFolderModal() {
  editingFolderId = null; // 新規作成モード
  elements.folderName.value = '';
  document.querySelector('#folderModal h2').textContent = '新しいフォルダ'; // タイトル変更
  elements.confirmFolder.textContent = '作成'; // ボタン変更
  elements.folderModal.classList.add('open');
  setTimeout(() => elements.folderName.focus(), 300);
}

function editFolder(id, currentName) {
  editingFolderId = id; // 編集モード
  elements.folderName.value = currentName;
  document.querySelector('#folderModal h2').textContent = 'フォルダ名を変更'; // タイトル変更
  elements.confirmFolder.textContent = '保存'; // ボタン変更
  elements.folderModal.classList.add('open');
  setTimeout(() => elements.folderName.focus(), 300);
}

// ========================================
// グローバル検索
// ========================================
async function renderSearchResults() {
  const query = elements.globalSearch.value.trim();

  if (!query) {
    elements.searchResults.classList.add('hidden');
    elements.folderList.classList.remove('hidden');
    elements.clearSearch.classList.add('hidden');
    return;
  }

  elements.clearSearch.classList.remove('hidden');
  const results = await Store.searchMemos(query);
  const folders = await Store.getFolders();

  if (results.length === 0) {
    elements.searchResultsList.innerHTML = `
      <div class="text-center py-8 text-ios-gray">
        「${escapeHtml(query)}」は見つかりませんでした
      </div>
    `;
  } else {
    elements.searchResultsList.innerHTML = results.map(memo => {
      const folder = folders.find(f => f.id === memo.folderId);
      const lines = (memo.content || '').split('\n').filter(l => l.trim());
      let line1 = memo.title || lines[0] || '無題のメモ';
      let line2 = memo.title ? (lines[0] || '') : (lines[1] || '');

      return `
        <div 
          class="bg-ios-card rounded-xl shadow-ios px-4 py-3 cursor-pointer active:bg-gray-50"
          onclick="openMemo('${memo.id}')"
        >
          <div class="text-xs text-ios-blue mb-1">📁 ${escapeHtml(folder?.name || '不明')}</div>
          <div class="font-semibold text-gray-800 truncate">${highlightText(line1, query)}</div>
          <div class="text-sm text-ios-gray truncate mt-0.5">${highlightText(line2, query)}</div>
        </div>
      `;
    }).join('');
  }

  elements.searchResults.classList.remove('hidden');
  elements.folderList.classList.add('hidden');
}

// テキストハイライト
function highlightText(text, query) {
  if (!query) return escapeHtml(text);
  const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
  return escapeHtml(text).replace(regex, '<mark class="bg-yellow-200 rounded px-0.5">$1</mark>');
}

// ========================================
// バックアップ・復元
// ========================================
async function createBackup() {
  const data = await Store.exportAllData();
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `memo_backup_${new Date().toISOString().split('T')[0]}.json`;
  a.click();

  URL.revokeObjectURL(url);
  elements.settingsModal.classList.remove('open');
}

async function restoreFromBackup(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if (!data.folders || !data.memos) {
      alert('無効なバックアップファイルです');
      return;
    }

    if (!confirm(`${data.folders.length}個のフォルダと${data.memos.length}個のメモを復元しますか？\n\n※現在のデータは上書きされます`)) {
      return;
    }

    await Store.importData(data);
    elements.settingsModal.classList.remove('open');
    await renderFolders();
    alert('復元が完了しました！');
  } catch (e) {
    alert('復元に失敗しました: ' + e.message);
  }
}

// ========================================
// ユーティリティ
// ========================================
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 日付を見やすくフォーマット
function formatDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const time = `${hours}:${minutes}`;

  if (isToday) {
    return `今日 ${time}`;
  } else if (isYesterday) {
    return `昨日 ${time}`;
  } else {
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}/${day} ${time}`;
  }
}

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ========================================
// Markdown入力支援ツールバー
// ========================================

// 行頭に記号を挿入する共通関数
function insertAtLineStart(prefix) {
  const textarea = elements.memoContent;
  const start = textarea.selectionStart;
  const content = textarea.value;

  // 現在の行の先頭を探す
  let lineStart = start;
  while (lineStart > 0 && content[lineStart - 1] !== '\n') {
    lineStart--;
  }

  // 行頭に記号を挿入
  textarea.value = content.substring(0, lineStart) + prefix + content.substring(lineStart);

  // カーソル位置を調整
  const newPos = start + prefix.length;
  textarea.setSelectionRange(newPos, newPos);
  textarea.focus();
  updateCharCount();
}

// 選択テキストを囲む共通関数
function wrapSelection(before, after) {
  const textarea = elements.memoContent;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const content = textarea.value;
  const selectedText = content.substring(start, end);

  if (selectedText) {
    // 選択範囲がある場合、囲む
    textarea.value = content.substring(0, start) + before + selectedText + after + content.substring(end);
    textarea.setSelectionRange(start + before.length, end + before.length);
  } else {
    // 選択範囲がない場合、記号を挿入してカーソルを真ん中に
    textarea.value = content.substring(0, start) + before + after + content.substring(end);
    textarea.setSelectionRange(start + before.length, start + before.length);
  }

  textarea.focus();
  updateCharCount();
}

// 見出し2を挿入
function insertHeading2() {
  insertAtLineStart('## ');
}

// 見出し3を挿入
function insertHeading3() {
  insertAtLineStart('### ');
}

// 見出し1を挿入（フェーズ3）
function insertHeading1() {
  insertAtLineStart('# ');
}

// 太字を挿入
function insertBold() {
  wrapSelection('**', '**');
}

// リストを挿入
function insertList() {
  insertAtLineStart('- ');
}

// チェックボックスを挿入
function insertCheckbox() {
  insertAtLineStart('- [ ] ');
}

// 引用を挿入（フェーズ3）
function insertQuote() {
  insertAtLineStart('> ');
}

// 区切り線を挿入（フェーズ3）
function insertHr() {
  // 現在のカーソル位置の前後に改行を入れて水平線を挿入
  const textarea = elements.memoContent;
  const start = textarea.selectionStart;
  const content = textarea.value;

  // インサートするテキスト（前後に改行）
  const hrText = '\n\n---\n\n';

  textarea.value = content.substring(0, start) + hrText + content.substring(start);

  // カーソル位置を調整（挿入した水平線の後へ）
  const newPos = start + hrText.length;
  textarea.setSelectionRange(newPos, newPos);
  textarea.focus();
  updateCharCount();
}

// ========================================
// プレビュー機能
// ========================================
function switchToEditMode() {
  isPreviewMode = false;
  elements.memoContent.classList.remove('hidden');
  elements.previewArea.classList.add('hidden');
  elements.editTabBtn.classList.add('bg-white', 'text-gray-800', 'shadow-sm');
  elements.editTabBtn.classList.remove('text-gray-500');
  elements.previewTabBtn.classList.remove('bg-white', 'text-gray-800', 'shadow-sm');
  elements.previewTabBtn.classList.add('text-gray-500');
}

function switchToPreviewMode() {
  isPreviewMode = true;
  // Markdownをレンダリング（breaks: true で改行を有効化）
  const content = elements.memoContent.value;
  elements.previewArea.innerHTML = marked.parse(content, { breaks: true });

  elements.memoContent.classList.add('hidden');
  elements.previewArea.classList.remove('hidden');
  elements.previewTabBtn.classList.add('bg-white', 'text-gray-800', 'shadow-sm');
  elements.previewTabBtn.classList.remove('text-gray-500');
  elements.editTabBtn.classList.remove('bg-white', 'text-gray-800', 'shadow-sm');
  elements.editTabBtn.classList.add('text-gray-500');
}

// ========================================
// ヘッダー折りたたみ（集中モード）
// ========================================
function toggleHeader() {
  isHeaderCollapsed = !isHeaderCollapsed;
  const arrow = elements.toggleHeaderBtn.querySelector('svg');

  if (isHeaderCollapsed) {
    elements.headerArea.classList.add('collapsed');
    arrow.style.transform = 'rotate(180deg)';
  } else {
    elements.headerArea.classList.remove('collapsed');
    arrow.style.transform = 'rotate(0deg)';
  }
}

// ========================================
// ファイルインポート
// ========================================
async function importFile(file) {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    const content = e.target.result;
    const fileName = file.name.replace(/\.(txt|md)$/i, '');

    // 現在のエディタに反映
    elements.memoTitle.value = fileName;
    elements.memoContent.value = content;
    updateCharCount();

    // 即時プレビュー更新（プレビューモードの場合）
    if (isPreviewMode) {
      elements.previewArea.innerHTML = marked.parse(content, { breaks: true });
    }
  };
  reader.readAsText(file);
}

// ========================================
// 上書き保存 & トースト通知
// ========================================
async function saveCurrentMemo() {
  const folderId = elements.folderSelect.value;
  const title = elements.memoTitle.value.trim();
  const content = elements.memoContent.value;

  // バリデーション：空のメモは保存しない（または警告）
  if (!title && !content.trim()) {
    showToast('⚠️ タイトルまたは本文を入力してください');
    return;
  }

  // フォルダ未選択の場合は「未分類」へ
  let targetFolderId = folderId;
  if (!targetFolderId) {
    const uncategorized = await getOrCreateUncategorizedFolder();
    targetFolderId = uncategorized.id;
    // セレクトボックスも更新
    elements.folderSelect.value = targetFolderId;
  }

  if (currentMemoId) {
    await Store.updateMemo(currentMemoId, { folderId: targetFolderId, title, content });
  } else {
    const newMemo = await Store.addMemo({ folderId: targetFolderId, title, content });
    currentMemoId = newMemo.id; // 新規作成後はIDを保持
  }

  await renderFolders();
  await renderSearchResults();
  showToast('保存しました！');
}

function showToast(message) {
  elements.toastMessage.textContent = message;
  elements.toastNotification.classList.add('show');

  setTimeout(() => {
    elements.toastNotification.classList.remove('show');
  }, 2000);
}

// ========================================
// Markdownヘルプモーダル
// ========================================
function showMarkdownHelp() {
  elements.markdownHelpModal.classList.add('open');
}

function closeMarkdownHelp() {
  elements.markdownHelpModal.classList.remove('open');
}

// ========================================
// イベントリスナー
// ========================================
elements.newMemoBtn.addEventListener('click', openEditor);
elements.addFolderBtn.addEventListener('click', showFolderModal);
elements.closeEditor.addEventListener('click', closeEditor);
elements.memoContent.addEventListener('input', updateCharCount);
elements.toggleSearchReplace.addEventListener('click', toggleSearchReplace);
elements.searchText.addEventListener('input', findMatches);
elements.findNextBtn.addEventListener('click', findNext);
elements.replaceBtn.addEventListener('click', replaceOne);
elements.replaceAllBtn.addEventListener('click', replaceAll);
elements.exportBtn.addEventListener('click', exportMemo);
elements.deleteBtn.addEventListener('click', deleteMemo);

elements.globalSearch.addEventListener('input', renderSearchResults);
elements.clearSearch.addEventListener('click', () => {
  elements.globalSearch.value = '';
  renderSearchResults();
});

// 設定モーダル
elements.settingsBtn.addEventListener('click', () => {
  elements.settingsModal.classList.add('open');
});
elements.closeSettings.addEventListener('click', () => {
  elements.settingsModal.classList.remove('open');
});
elements.backupBtn.addEventListener('click', createBackup);
elements.restoreFile.addEventListener('change', (e) => {
  if (e.target.files[0]) {
    restoreFromBackup(e.target.files[0]);
    e.target.value = '';
  }
});
elements.resetDataBtn.addEventListener('click', async () => {
  if (confirm('すべてのフォルダとメモを削除しますか？\nこの操作は取り消せません。')) {
    await Store.clearAllData();
    elements.settingsModal.classList.remove('open');
    await initializeData();
    await renderFolders();
  }
});

// インラインフォルダ作成
elements.addFolderInlineBtn.addEventListener('click', () => {
  elements.inlineFolderCreate.classList.remove('hidden');
  elements.inlineFolderName.value = '';
  elements.inlineFolderName.focus();
});
elements.cancelInlineFolder.addEventListener('click', () => {
  elements.inlineFolderCreate.classList.add('hidden');
});
elements.confirmInlineFolder.addEventListener('click', async () => {
  const name = elements.inlineFolderName.value.trim();
  if (name) {
    const folder = await Store.addFolder(name);
    await updateFolderSelect(folder.id);
    elements.inlineFolderCreate.classList.add('hidden');
  }
});
elements.inlineFolderName.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    elements.confirmInlineFolder.click();
  }
});

// フォルダモーダル
elements.cancelFolder.addEventListener('click', () => {
  elements.folderModal.classList.remove('open');
});

elements.confirmFolder.addEventListener('click', async () => {
  const name = elements.folderName.value.trim();
  if (name) {
    if (editingFolderId) {
      await Store.updateFolder(editingFolderId, name);
    } else {
      await Store.addFolder(name);
    }
    await renderFolders();
    await updateFolderSelect(editingFolderId || ''); // 編集時はそのIDを選択状態にする等の配慮
  }
  elements.folderModal.classList.remove('open');
});

elements.folderName.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    elements.confirmFolder.click();
  }
});

// 確認モーダル
elements.confirmCancel.addEventListener('click', () => {
  elements.confirmModal.classList.remove('open');
  confirmCallback = null;
});

elements.confirmOk.addEventListener('click', () => {
  if (confirmCallback) {
    confirmCallback();
  }
  elements.confirmModal.classList.remove('open');
  confirmCallback = null;
});

// Markdownツールバー
elements.insertListBtn.addEventListener('click', insertList);
elements.insertH2Btn.addEventListener('click', insertHeading2);
elements.insertH3Btn.addEventListener('click', insertHeading3);
// フェーズ3追加
elements.insertH1Btn.addEventListener('click', insertHeading1);
elements.insertBoldBtn.addEventListener('click', insertBold);
elements.insertQuoteBtn.addEventListener('click', insertQuote);
// elements.insertCheckboxBtn.addEventListener('click', insertCheckbox); // Removed
elements.insertHrBtn.addEventListener('click', insertHr);

// Undo
elements.undoBtn.addEventListener('click', () => {
  document.execCommand('undo');
});

// 編集/プレビュー切り替え
elements.editTabBtn.addEventListener('click', switchToEditMode);
elements.previewTabBtn.addEventListener('click', switchToPreviewMode);

// Markdownヘルプモーダル
elements.markdownHelpBtn.addEventListener('click', showMarkdownHelp);
elements.closeMarkdownHelp.addEventListener('click', closeMarkdownHelp);

// フェーズ2追加
elements.toggleHeaderBtn.addEventListener('click', toggleHeader);
elements.importFile.addEventListener('change', (e) => {
  if (e.target.files[0]) {
    importFile(e.target.files[0]);
    e.target.value = ''; // Reset input to allow re-importing same file
  }
});
elements.saveBtn.addEventListener('click', saveCurrentMemo);

// ========================================
// 初期化
// ========================================
async function init() {
  await migrateFromLocalStorage();
  await initializeData();
  await renderFolders();
}

init();

// ========================================
// Visual Viewport Fix for Mobile Keyboard
// ========================================
if (window.visualViewport) {
  function resizeHandler() {
    const appContainer = document.getElementById('app');
    if (appContainer) {
      // Force app height to match the visual viewport (visible area above keyboard)
      appContainer.style.height = window.visualViewport.height + 'px';
      // Ensure no overflow on the container itself (content scrolls internally)
      appContainer.style.overflow = 'hidden';
      // Prevent slight scroll offsets
      window.scrollTo(0, 0);
    }
  }

  window.visualViewport.addEventListener('resize', resizeHandler);
  window.visualViewport.addEventListener('scroll', resizeHandler);

  // Initial call
  resizeHandler();
}
