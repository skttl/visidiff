<script setup lang="ts">
const props = defineProps<{ a: string; b: string }>()

const pos = ref(50) // percent

const wrap = ref<HTMLDivElement | null>(null)
let dragging = false

function onPointerDown(e: PointerEvent) {
  dragging = true
  ;(e.target as Element).setPointerCapture?.(e.pointerId)
  update(e)
}
function onPointerMove(e: PointerEvent) {
  if (!dragging) return
  update(e)
}
function onPointerUp(e: PointerEvent) {
  dragging = false
  ;(e.target as Element).releasePointerCapture?.(e.pointerId)
}
function update(e: PointerEvent) {
  if (!wrap.value) return
  const rect = wrap.value.getBoundingClientRect()
  const x = Math.min(Math.max(e.clientX - rect.left, 0), rect.width)
  pos.value = (x / rect.width) * 100
}
</script>

<template>
  <div
    ref="wrap"
    class="relative w-full select-none"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
  >
    <img :src="props.a" alt="A" class="block w-full" />
    <div
      class="absolute inset-0 overflow-hidden"
      :style="{ width: pos + '%' }"
    >
      <img
        :src="props.b"
        alt="B"
        class="block max-w-none w-[var(--w)]"
        :style="{ ['--w' as any]: (10000 / pos) + '%' }"
      />
    </div>
    <div
      class="pointer-events-none absolute inset-y-0 w-px bg-emerald-400 shadow-[0_0_0_1px_rgba(16,185,129,0.5)]"
      :style="{ left: pos + '%' }"
    >
      <div class="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-emerald-400 bg-slate-950/80"></div>
    </div>
  </div>
</template>
