<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="modal detail-modal"
      :style="{ zIndex: zIndex, top: localTop, left: localLeft }"
      @mousedown="$emit('focus')"
    >
      <div class="modal-header" @mousedown="startDrag">
        <h3 style="margin: 0; font-size: 16px;">
          ⚙️ 設備詳細資訊 - [ {{ blockId }} ]
        </h3>
        <button @click="$emit('close')" class="icon-btn close-btn">✖</button>
      </div>

      <div class="modal-body">
        
        <div class="info-section">
          <div v-if="isEditingText" class="edit-box">
            <label>設備類型：</label>
            <input v-model="tempTextData.type" class="edit-input" placeholder="例如：水泵、控制閥..." />
            <label>控制邏輯：</label>
            <textarea v-model="tempTextData.logic" class="edit-input" rows="2" placeholder="請輸入控制邏輯..."></textarea>
            <div style="text-align: right; margin-top: 5px;">
              <button @click="isEditingText = false" class="icon-btn">取消</button>
              <button @click="saveText" class="icon-btn save-btn" style="background: #2ecc71; color: white;">💾 儲存</button>
            </div>
          </div>
          <div v-else class="info-box" style="display: flex; justify-content: space-between;">
            <div>
              <p style="margin: 5px 0;"><strong>設備類型：</strong> {{ blockData.type || '(未設定)' }}</p>
              <p style="margin: 5px 0;"><strong>控制邏輯：</strong> {{ blockData.logic || '(未設定)' }}</p>
            </div>
            <button @click="startEdit" class="icon-btn">✏️ 編輯</button>
          </div>
        </div>

        <hr style="border: 0; border-top: 1px solid #eee; margin: 15px 0;" />

        <div class="image-header">
          <span style="font-weight: bold; color: #555;">📎 附加圖面：</span>
          <div>
            <button class="icon-btn" :class="{ 'active-mode': isModalAnnotationMode }" @click="isModalAnnotationMode = !isModalAnnotationMode" title="新增標註">
              💬 {{ isModalAnnotationMode ? '取消標註' : '新增對話框' }}
            </button>
            <button @click="resetModalZoom" class="icon-btn" title="重設視角">🏠 重設</button>
            <label class="icon-btn" style="cursor: pointer;">
              ⬆️ 上傳圖面
              <input type="file" @change="onFileChange" accept="image/svg+xml, image/png, image/jpeg" style="display: none;" />
            </label>
            <button v-if="blockData.customImageUrl || blockData.svgFile" @click="$emit('deleteImage', blockId)" class="icon-btn delete-icon">🗑️ 刪除</button>
          </div>
        </div>

        <div class="image-container" style="flex: 1; overflow: hidden; position: relative; border: 1px solid #ddd; background: #fafafa; border-radius: 4px; margin-top: 10px;">
          <div v-if="blockData.customImageUrl || blockData.svgFile" class="modal-img-viewport" @wheel.prevent="handleModalWheel" @mousedown="startModalPan" style="width: 100%; height: 100%; overflow: hidden;">
            <div class="modal-svg-wrapper" :style="modalPanZoomStyle" @click="handleModalImgClick">
              <img
                v-if="blockData.customImageUrl || !isInlineSvg"
                :src="blockData.customImageUrl || `/DRAWING/${selectedDrawing}/${blockData.svgFile}`"
                alt="詳細圖面"
                @error="$emit('imageError', blockId)"
                class="modal-img-wrapper"
                draggable="false"
              >
              
              <div 
                v-else 
                v-html="fetchedSvgContent" 
                class="modal-img-wrapper inline-svg"
              ></div>
              <AnnotationLayer
                :annotations="modalAnnotations"
                :scale="modalScale"
                :isAnnoInputOpen="isModalAnnoInputOpen"
                :draftAnno="modalDraftAnno"
                @updateDraftText="modalDraftAnno.text = $event"
                @updateDraftColor="modalDraftAnno.color = $event"
                @updateDraftFontSize="modalDraftAnno.fontSize = $event"
                @updateDraftType="modalDraftAnno.type = $event"
                @closeModal="isModalAnnoInputOpen = false"
                @confirmAdd="confirmModalAddAnno"
                @startDrag="startModalDragAnno"
                @delete="deleteModalAnnotation"
                @edit="editModalAnnotation"
              />
            </div>
          </div>
          <div v-else style="padding: 40px; text-align: center; color: #999;">
            目前無附加圖面，請點擊上方按鈕上傳。
          </div>
        </div>

      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useModalPanZoom } from '../composables/usePanZoom'
import AnnotationLayer from './AnnotationLayer.vue'
import { useAnnotations } from '../composables/useAnnotations'

const props = defineProps({
  isOpen: Boolean,
  blockId: String,
  blockData: Object,
  selectedDrawing: String,
  zIndex: Number,
  top: String,
  left: String
})

const emit = defineEmits(['close', 'saveText', 'uploadImage', 'deleteImage', 'imageError', 'focus'])

// 本地座標變數 (拖曳用)
const localTop = ref(props.top)
const localLeft = ref(props.left)

// 縮放與平移模組
const {
  modalScale,
  modalTranslateX: localTranslateX,
  modalTranslateY: localTranslateY,
  modalPanZoomStyle,
  resetModalZoom,
  handleModalWheel,
  startModalPan
} = useModalPanZoom()

watch(() => props.isOpen, (newVal) => { if (newVal) resetModalZoom() })

// ✨ 新增：存放 SVG 原始碼的變數
const fetchedSvgContent = ref('')
const isInlineSvg = ref(false)

// ✨ 新增：監聽圖紙變化，如果是 SVG 檔案就去後端抓取代碼
// ✨ 修正：只針對 svgFile 的「字串值」進行監聽，避免物件更新時造成無限重繪與閃爍
watch(() => props.blockData.svgFile, async (newSvgFile) => {
  if (!props.isOpen) return; // 確保視窗開啟才執行
  
  isInlineSvg.value = false;
  fetchedSvgContent.value = '';

  if (newSvgFile && newSvgFile.toLowerCase().endsWith('.svg')) {
    try {
      const res = await fetch(`/DRAWING/${props.selectedDrawing}/${newSvgFile}`);
      if (res.ok) {
        fetchedSvgContent.value = await res.text();
        isInlineSvg.value = true;
      }
    } catch (error) {
      console.error('載入 SVG 失敗:', error);
    }
  }
}, { immediate: true });

// 標註大腦模組
const modalAnnotations = ref(props.blockData.annotations || [])
const saveModalAnnotations = (newAnnos) => {
  // ✨ 補上 props.blockId
  emit('saveText', props.blockId, { type: props.blockData.type || '', logic: props.blockData.logic || '', annotations: newAnnos })
}

// ✨ 新增：同步外部傳入的標註資料，防止重繪時脫鉤
watch(() => props.blockData.annotations, (newAnnos) => {
  if (newAnnos) {
    modalAnnotations.value = newAnnos;
  }
}, { deep: true });

const {
  isAnnotationMode: isModalAnnotationMode,
  isAnnoInputOpen: isModalAnnoInputOpen,
  draftAnno: modalDraftAnno,
  confirmAddAnno: confirmModalAddAnno,
  deleteAnnotation: deleteModalAnnotation,
  startDragAnno: startModalDragAnno,
  editAnnotation: editModalAnnotation
} = useAnnotations(modalAnnotations, modalScale, localTranslateX, localTranslateY, saveModalAnnotations)

// 點擊圖片新增標註
const handleModalImgClick = (e) => {
  if (!isModalAnnotationMode.value) return;
  const viewport = e.currentTarget.closest('.modal-img-viewport') || e.currentTarget;
  const rect = viewport.getBoundingClientRect();
  const x = (e.clientX - rect.left - localTranslateX.value) / modalScale.value;
  const y = (e.clientY - rect.top - localTranslateY.value) / modalScale.value;
  modalDraftAnno.value = { targetX: x, targetY: y, x: x + 100, y: y - 80, text: '', id: null, color: '#e74c3c', fontSize: 14, type: 'bubble' };
  isModalAnnoInputOpen.value = true;
  isModalAnnotationMode.value = false;
}

// 文字編輯與存檔邏輯
const isEditingText = ref(false)
const tempTextData = ref({ type: '', logic: '' })

const startEdit = () => {
  tempTextData.value = { type: props.blockData.type || '', logic: props.blockData.logic || '' }
  isEditingText.value = true
}

// 文字編輯與存檔邏輯
const saveText = () => {
  // ✨ 補上 props.blockId
  emit('saveText', props.blockId, { ...tempTextData.value, annotations: modalAnnotations.value })
  isEditingText.value = false
}

const onFileChange = (event) => { 
  const file = event.target.files[0]; 
  // ✨ 補上 props.blockId
  if (file) emit('uploadImage', props.blockId, file) 
}

// 視窗拖曳邏輯
const startDrag = (e) => {
  if (e.target.tagName.toLowerCase() === 'button') return;
  const modal = e.target.closest('.modal')
  if (!modal) return
  let startX = e.clientX, startY = e.clientY, initialTop = modal.offsetTop, initialLeft = modal.offsetLeft
  const onMouseMove = (moveEvent) => {
    localTop.value = `${initialTop + moveEvent.clientY - startY}px`
    localLeft.value = `${initialLeft + moveEvent.clientX - startX}px`
  }
  const onMouseUp = () => {
    document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp)
  }
  document.addEventListener('mousemove', onMouseMove); document.addEventListener('mouseup', onMouseUp)
}
</script>

<style scoped>
/* 多視窗獨立懸浮專用 CSS */
/* 多視窗獨立懸浮專用 CSS */
.detail-modal { 
  position: fixed; 
  width: 70vw; 
  height: 80vh; 
  min-width: 400px; 
  min-height: 300px; 
  resize: both; 
  background-color: white; /* ✨ 補上不透明白底 */
  border-radius: 8px;      /* ✨ 補上圓角 */
  box-shadow: 0 10px 30px rgba(0,0,0,0.3); /* ✨ 補上懸浮陰影 */
  overflow: hidden;
}
.modal-header { padding: 10px 15px; background: #f8f9fa; border-bottom: 1px solid #ddd; display: flex; justify-content: space-between; align-items: center; cursor: move; }
.modal-body { padding: 15px; display: flex; flex-direction: column; height: calc(100% - 45px); box-sizing: border-box; overflow: hidden; }

.edit-input { width: 100%; padding: 8px; margin-top: 5px; margin-bottom: 10px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; font-family: sans-serif; }
.image-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; }

/* 標註與圖片專用 CSS (使用固定虛擬畫布) */
.modal-svg-wrapper { 
  display: inline-block; 
  position: relative; 
  transform-origin: 0 0; 
}
.modal-img-wrapper { 
  display: block; 
  width: 1000px !important;  /* ✨ 鎖定彈出視窗的絕對寬度 */
  height: auto !important;   /* ✨ 解除原本的 700px 限制，讓長圖自然向下延伸 */
  object-fit: contain; 
  pointer-events: none; 
  max-width: none !important;
}
.active-mode { background-color: #f39c12 !important; color: white !important; border-color: #e67e22 !important; font-weight: bold; }

/* ✨ 讓 v-html 渲染出來的 SVG 撐滿空間 */
.inline-svg :deep(svg) {
  width: 100%;
  height: 100%;
  display: block;
}

/* ✨ 1. 解除封印：把 pointer-events 打開，讓滑鼠可以碰到 SVG */
.inline-svg {
  pointer-events: auto !important; 
}

/* ✨ 2. 確保裡面的文字可以被反白選取，游標變成輸入棒 */
:deep(.inline-svg text), 
:deep(.inline-svg tspan) {
  cursor: text !important;
  user-select: text !important;
  pointer-events: auto !important;
}

/* 讓 v-html 渲染出來的 SVG 撐滿空間 (保留這段) */
.inline-svg :deep(svg) {
  width: 100%;
  height: auto !important; /* ✨ 原本是 100%，改為 auto 讓 SVG 維持原本的長寬比 */
  display: block;
}

</style>