<script setup lang="ts">
defineProps<{ src: string; alt: string }>();
</script>

<template>
  <img class="thumb" :src="`/screenshots/${src.replace(/\\/g, '/')}`" :alt="alt" loading="lazy" />
</template>

<style scoped>
.thumb {
  width: 60px;
  height: 40px;
  object-fit: cover;
  object-position: top;
  border: 1px solid var(--border);
  border-radius: 3px;
}
</style>
