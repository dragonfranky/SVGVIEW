import { ref, computed, nextTick } from 'vue' // ✨ 補上 computed

export function useSystemData(resetZoom) {
  const drawingOptions = ref([])
  const selectedDrawing = ref('')
  const rawSvg = ref('')
  const currentBlockData = ref({})
  const isLoading = ref(false)
  const annotations = ref([])

  const isAddMainModalOpen = ref(false)
  const newDrawing = ref({ id: '', name: '', category: '', file: null }) // ✨ 加上 category

  // ✨ 自動把平鋪的陣列，轉換成分類群組物件
  const groupedDrawings = computed(() => {
    const groups = {};
    drawingOptions.value.forEach(dwg => {
      const cat = dwg.category || '未分類';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(dwg);
    });
    return groups;
  });

  // ==========================================
  // 多視窗陣列與圖層管理器
  // ==========================================
  const openModals = ref([])
  let modalZIndexCounter = 1000

  const openDetailModal = (blockId, blockData) => {
    // ✨ 修正：必須 blockId 與 drawingId 都一樣才算重複開啟
    const existing = openModals.value.find(m => m.blockId === blockId && m.drawingId === selectedDrawing.value);
    if (existing) {
      bringToFront(existing.id);
      return;
    }
    const offset = (openModals.value.length % 5) * 3; 
    modalZIndexCounter++;
    openModals.value.push({
      id: `modal_${Date.now()}_${Math.random()}`,
      blockId: blockId,
      drawingId: selectedDrawing.value, // ✨ 新增這行：記錄這個視窗是屬於哪張圖紙的
      zIndex: modalZIndexCounter,
      top: `${10 + offset}vh`,
      left: `${15 + offset}vw`,
      blockData: {
        type: blockData?.type || '',     
        logic: blockData?.logic || '',   
        svgFile: blockData?.svgFile || null, 
        customImageUrl: blockData?.customImageUrl || null,
        annotations: blockData?.annotations || []
      }
    });
  }

  const bringToFront = (modalId) => {
    const modal = openModals.value.find(m => m.id === modalId);
    if (modal) {
      modalZIndexCounter++;
      modal.zIndex = modalZIndexCounter;
    }
  }

  const closeDetailModal = (modalId) => {
    openModals.value = openModals.value.filter(m => m.id !== modalId);
  }

  // ==========================================
  // API 與系統邏輯
  // ==========================================
  const fetchAvailableDrawings = async () => {
    try {
      const res = await fetch('/api/drawings');
      if (res.ok) {
        drawingOptions.value = await res.json();
        if (drawingOptions.value.length > 0) {
          if (!drawingOptions.value.some(d => d.value === selectedDrawing.value)) selectedDrawing.value = drawingOptions.value[0].value;
        }
      }
    } catch (error) {}
  }

  const applyTagHighlights = () => {
    const container = document.querySelector('.svg-wrapper');
    if (!container) return;
    const textNodes = container.querySelectorAll('text, tspan');
    textNodes.forEach(node => {
      const text = node.textContent.trim();
      node.classList.remove('has-data-tag');
      if (text.length >= 2 && currentBlockData.value[text] && 
         (currentBlockData.value[text].svgFile || currentBlockData.value[text].logic || currentBlockData.value[text].type)) {
        node.classList.add('has-data-tag');
      }
    });
  }

  const loadSystemData = async () => {
    if (!selectedDrawing.value) return;
    isLoading.value = true;
    if (resetZoom) resetZoom(); 

    try {
      const response = await fetch(`/DRAWING/${selectedDrawing.value}/${selectedDrawing.value}.svg`)
      if (!response.ok) throw new Error(`找不到底圖檔案`)
      rawSvg.value = await response.text()

      try {
        const dataRes = await fetch(`/api/data/${selectedDrawing.value}`);
        if (dataRes.ok) {
          currentBlockData.value = await dataRes.json();
          annotations.value = currentBlockData.value._annotations || [];
        } else {
          currentBlockData.value = {}; annotations.value = [];
        }
      } catch (e) { currentBlockData.value = {}; annotations.value = []; }
    } catch (error) { rawSvg.value = `<p style="color:red; padding:20px;">無法顯示：${error.message}</p>` } 
    finally { isLoading.value = false; await nextTick(); applyTagHighlights(); }
  }

  // ✨ 真正被修復的「修改圖紙」
  const editCurrentDrawing = async () => {
    // 找出目前圖紙的舊資料
    const dwg = drawingOptions.value.find(d => d.value === selectedDrawing.value);
    const currentName = dwg ? dwg.label : selectedDrawing.value;
    const currentCat = dwg ? dwg.category : '未分類';

    const newName = prompt('請輸入新的圖紙顯示名稱：', currentName);
    if (newName === null) return;
    
    // ✨ 多彈出一個視窗詢問分類
    const newCat = prompt('請輸入分類名稱 (如：水系統、鍋爐區)：', currentCat);
    if (newCat === null) return;

    try {
      const res = await fetch(`/api/drawings/${selectedDrawing.value}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, category: newCat }) // ✨ 送出分類
      });
      if (res.ok) await fetchAvailableDrawings();
    } catch (e) {}
  }

  // ✨ 真正被修復的「刪除圖紙」
  const deleteCurrentDrawing = async () => {
    if (!confirm(`確定要刪除圖紙 [ ${selectedDrawing.value} ] 嗎？所有資料將無法復原！`)) return;
    try {
      const res = await fetch(`/api/drawings/${selectedDrawing.value}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchAvailableDrawings();
        if (drawingOptions.value.length > 0) {
          selectedDrawing.value = drawingOptions.value[0].value;
          loadSystemData();
        } else {
          selectedDrawing.value = ''; rawSvg.value = '';
        }
      }
    } catch (e) {}
  }

  const onNewMainFileChange = (e) => { newDrawing.value.file = e.target.files[0]; }

  // ✨ 真正被修復的「新增圖紙」
  const submitNewDrawing = async () => {
    if (!newDrawing.value.id || !newDrawing.value.file) {
      alert('圖紙代號與底圖檔案為必填！');
      return;
    }
    const formData = new FormData();
    formData.append('drawingId', newDrawing.value.id);
    formData.append('drawingName', newDrawing.value.name);
    formData.append('category', newDrawing.value.category || '未分類'); // ✨ 送出分類
    formData.append('file', newDrawing.value.file);

    try {
      const res = await fetch('/api/upload-main', { method: 'POST', body: formData });
      if (res.ok) {
        isAddMainModalOpen.value = false;
        newDrawing.value = { id: '', name: '', file: null };
        await fetchAvailableDrawings();
        selectedDrawing.value = formData.get('drawingId');
        loadSystemData();
      } else {
        alert('新增圖紙失敗');
      }
    } catch (error) { alert('系統連線錯誤'); }
  }

  // ✨ 強化強制刷新畫面的「存檔標註」
  const saveBlockText = async (drawingId, blockId, newData) => { // ✨ 接收 drawingId
    try {
      const res = await fetch(`/api/data/${drawingId}/${blockId}`, { // ✨ 存到正確的 drawingId 路徑
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: newData.type, logic: newData.logic, annotations: newData.annotations || [] })
      });
      if (res.ok) {
        // ✨ 只有當存檔的視窗剛好是「當前主畫面」時，才更新主畫面資料，否則只更新視窗自己
        if (drawingId === selectedDrawing.value) {
          if (!currentBlockData.value[blockId]) currentBlockData.value[blockId] = {};
          currentBlockData.value[blockId] = { ...currentBlockData.value[blockId], type: newData.type, logic: newData.logic, annotations: newData.annotations || [] };
          await nextTick(); applyTagHighlights(); // 主畫面才需要重繪 Tag
        }
        
        const modal = openModals.value.find(m => m.blockId === blockId && m.drawingId === drawingId);
        if (modal) { 
          modal.blockData = { ...modal.blockData, type: newData.type, logic: newData.logic, annotations: newData.annotations || [] };
        }
      }
    } catch (error) { alert('文字儲存失敗'); }
  }

  // ✨ 強化強制刷新畫面的「上傳圖片」
  const handleFileUpload = async (drawingId, blockId, file) => { // ✨ 接收 drawingId
    const formData = new FormData();
    formData.append('drawingId', drawingId); // ✨ 傳送正確的圖紙 ID 給後端
    formData.append('blockId', blockId); 
    formData.append('file', file);
    try {
      const response = await fetch('/api/upload', { method: 'POST', body: formData });
      const result = await response.json();
      if (result.success) {
        const tempUrl = URL.createObjectURL(file);
        const savedFileName = `${result.filename}?t=${new Date().getTime()}`;

        if (drawingId === selectedDrawing.value) {
          if (!currentBlockData.value[blockId]) currentBlockData.value[blockId] = { type: '', logic: '' };
          currentBlockData.value[blockId] = { ...currentBlockData.value[blockId], svgFile: savedFileName, customImageUrl: tempUrl };
          await nextTick(); applyTagHighlights();
        }

        const modal = openModals.value.find(m => m.blockId === blockId && m.drawingId === drawingId);
        if (modal) { 
          modal.blockData = { ...modal.blockData, svgFile: savedFileName, customImageUrl: tempUrl };
        }
      }
    } catch (error) { alert('上傳失敗'); }
  }

  const deleteBlockImage = async (drawingId, blockId) => { // ✨ 接收 drawingId
    if (!confirm(`確定要刪除 [ ${blockId} ] 的圖面嗎？`)) return;
    try {
      const res = await fetch(`/api/image/${drawingId}/${blockId}`, { method: 'DELETE' }); // ✨ 刪除正確路徑
      if (res.ok) {
        if (drawingId === selectedDrawing.value && currentBlockData.value[blockId]) { 
          currentBlockData.value[blockId] = { ...currentBlockData.value[blockId], svgFile: null, customImageUrl: null };
          await nextTick(); applyTagHighlights();
        }
        const modal = openModals.value.find(m => m.blockId === blockId && m.drawingId === drawingId);
        if (modal) { 
          modal.blockData = { ...modal.blockData, svgFile: null, customImageUrl: null };
        }
      }
    } catch (error) { alert('刪除圖片失敗'); }
  }

  const handleImageError = (modalId) => { // ✨ 接收 modalId
    const modal = openModals.value.find(m => m.id === modalId);
    if (modal && !modal.blockData.customImageUrl) {
      modal.blockData = { ...modal.blockData, svgFile: null };
    }
  }

  return {
    drawingOptions, groupedDrawings, selectedDrawing, rawSvg, currentBlockData, isLoading, annotations,
    isAddMainModalOpen, newDrawing,
    openModals, openDetailModal, closeDetailModal, bringToFront,
    fetchAvailableDrawings, applyTagHighlights, loadSystemData, editCurrentDrawing,
    deleteCurrentDrawing, onNewMainFileChange, submitNewDrawing,
    saveBlockText, handleFileUpload, deleteBlockImage, handleImageError
  }
}