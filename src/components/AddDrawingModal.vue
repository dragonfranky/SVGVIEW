<template>
  <Teleport to="body">
    <div v-if="isOpen" class="overlay"></div>
    <div v-if="isOpen" class="modal add-main-modal">
      <div class="modal-header">
        <h3>新增主圖紙</h3>
        <button class="close-btn" @click="$emit('close')">關閉</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>圖紙代號 (必填，如 DR0007):</label>
          <input v-model="newDrawing.id" type="text" placeholder="請輸入英數代號">
        </div>
        <div class="form-group">
          <label>顯示名稱 (如 DR0007 - 鍋爐水系統):</label>
          <input v-model="newDrawing.name" type="text" placeholder="選填，方便辨識">
        </div>
        <div class="form-group">
          <label>所屬分類 (如 水系統、控制圖):</label>
          <input v-model="newDrawing.category" type="text" placeholder="選填，留空則歸入未分類">
        </div>
        <div class="form-group">
          <label>上傳底圖 (.svg 檔案):</label>
          <input type="file" accept=".svg" @change="$emit('fileChange', $event)">
        </div>
        <button class="submit-btn" @click="$emit('submit')">🚀 確認新增並上傳</button>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
// 接收 App.vue 傳遞過來的狀態
defineProps({
  isOpen: Boolean,
  newDrawing: Object
})
// 定義要通知 App.vue 執行的動作
defineEmits(['close', 'fileChange', 'submit'])
</script>

<style scoped>
.overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 999; }
.modal { position: fixed; background: white; border-radius: 8px; z-index: 1000; box-shadow: 0 10px 30px rgba(0,0,0,0.3); overflow: hidden; display: flex; flex-direction: column; }
.add-main-modal { top: 20vh; left: 50%; transform: translateX(-50%); width: 400px; padding-bottom: 20px; }

.modal-header { background: #2c3e50; color: white; padding: 12px 20px; display: flex; justify-content: space-between; align-items: center; }
.modal-header h3 { margin: 0; }
.close-btn { background: #e74c3c; color: white; border: none; padding: 5px 15px; border-radius: 4px; cursor: pointer; font-weight: bold; }

.modal-body { padding: 20px; flex: 1; display: flex; flex-direction: column; }
.form-group { margin-bottom: 10px; }
.form-group label { display: block; margin-bottom: 5px; font-weight: bold; color: #333; }
.form-group input[type="text"] { width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }

.submit-btn { background: #3498db; color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 14px; margin-top: 10px; }
.submit-btn:hover { background: #2980b9; }
</style>