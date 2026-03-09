import { ref, nextTick } from 'vue'

export function useSearch(scale, translateX, translateY, drawingOptions, selectedDrawing, loadSystemData, openDetailModal) {
  const searchQuery = ref('');
  const searchResults = ref([]);       // ✨ 存放搜尋結果的清單
  const isSearchListOpen = ref(false); // ✨ 控制清單視窗的開關
  const isSearching = ref(false);      // ✨ 顯示「正在搜尋中」的動畫狀態

  const handleSearch = async () => {
    if (!searchQuery.value.trim()) return;
    const query = searchQuery.value.trim().toUpperCase();

    // 初始化狀態
    searchResults.value = [];
    isSearching.value = true;
    isSearchListOpen.value = true; // 馬上打開視窗顯示「搜尋中...」

    // 🌍 全面深度掃描所有圖紙
    for (const dwg of drawingOptions.value) {
      // === 1. 掃描每張圖紙的「主畫面」 ===
      try {
        const res = await fetch(`/DRAWING/${dwg.value}/${dwg.value}.svg`);
        if (res.ok) {
          const text = await res.text();
          const parser = new DOMParser();
          const doc = parser.parseFromString(text, 'image/svg+xml');
          const textNodes = doc.querySelectorAll('text, tspan');
          
          const matchedTexts = new Set(); // 避免同一個字在同一張圖重複列出太多次
          for (const node of textNodes) {
            const nodeText = node.textContent.trim();
            if (nodeText.toUpperCase().includes(query)) {
              if (!matchedTexts.has(nodeText)) {
                matchedTexts.add(nodeText);
                // 把找到的結果塞進清單
                searchResults.value.push({
                  id: `main_${dwg.value}_${nodeText}_${Math.random()}`,
                  drawingId: dwg.value,
                  drawingLabel: dwg.label,
                  locationType: 'main',
                  matchText: nodeText
                });
              }
            }
          }
        }
      } catch (error) { console.error(error); }

      // === 2. 掃描每張圖紙所有的「詳細圖面 (彈出視窗)」 ===
      try {
        const dataRes = await fetch(`/api/data/${dwg.value}`);
        if (dataRes.ok) {
          const blockData = await dataRes.json();
          for (const blockId in blockData) {
            if (blockId === '_annotations') continue; 
            
            const svgFile = blockData[blockId].svgFile;
            if (svgFile) {
              const detailRes = await fetch(`/DRAWING/${dwg.value}/${svgFile}`);
              if (detailRes.ok) {
                const detailText = await detailRes.text();
                const parser = new DOMParser();
                const doc = parser.parseFromString(detailText, 'image/svg+xml');
                const textNodes = doc.querySelectorAll('text, tspan');
                
                let detailFound = false;
                for (const node of textNodes) {
                  if (node.textContent.trim().toUpperCase().includes(query)) { detailFound = true; break; }
                }

                if (detailFound) {
                  // 把找到的詳細圖面結果塞進清單
                  searchResults.value.push({
                    id: `detail_${dwg.value}_${blockId}_${Math.random()}`,
                    drawingId: dwg.value,
                    drawingLabel: dwg.label,
                    locationType: 'detail',
                    blockId: blockId,
                    blockData: blockData[blockId],
                    matchText: query
                  });
                }
              }
            }
          }
        }
      } catch (error) { console.error(error); }
    }

    isSearching.value = false; // 掃描結束
  };

  // ✨ 當使用者點擊清單中的某個結果時，執行「導航與對焦」
  const goToResult = async (result) => {
    isSearchListOpen.value = false; // 先關閉搜尋清單視窗

    // 1. 如果目標不在目前的圖紙，先幫他切換過去
    if (selectedDrawing.value !== result.drawingId) {
      selectedDrawing.value = result.drawingId;
      await loadSystemData();
      await nextTick();
      await new Promise(resolve => setTimeout(resolve, 300)); // 等待畫面長出來
    }

    // 2. 判斷要去哪裡
    if (result.locationType === 'main') {
      // 目標在主畫面 -> 執行放大對焦與閃爍
      const wrapper = document.querySelector('.svg-wrapper');
      if (!wrapper) return;
      const textNodes = wrapper.querySelectorAll('text, tspan');
      let targetNode = null;
      for (const node of textNodes) {
        if (node.textContent.trim() === result.matchText) { 
          targetNode = node; 
          break; 
        }
      }

      if (targetNode) {
        const wrapperRect = wrapper.getBoundingClientRect();
        const targetRect = targetNode.getBoundingClientRect();
        const origX = (targetRect.left + targetRect.width / 2 - wrapperRect.left) / scale.value;
        const origY = (targetRect.top + targetRect.height / 2 - wrapperRect.top) / scale.value;

        scale.value = 3;
        const viewport = document.querySelector('.svg-viewport');
        translateX.value = viewport.clientWidth / 2 - origX * scale.value;
        translateY.value = viewport.clientHeight / 2 - origY * scale.value;

        targetNode.classList.add('search-highlight');
        setTimeout(() => { targetNode.classList.remove('search-highlight'); }, 3000); 
      }
    } else if (result.locationType === 'detail') {
      // 目標在詳細圖面 -> 直接幫他打開那個視窗！
      openDetailModal(result.blockId, result.blockData);
    }
  };

  return { 
    searchQuery, searchResults, isSearchListOpen, isSearching, 
    handleSearch, goToResult 
  }
}