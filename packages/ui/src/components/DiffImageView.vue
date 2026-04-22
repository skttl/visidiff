<script setup lang="ts">
defineProps<{ diffSrc: string | null }>();
function imgSrc(p: string) {
  return `/screenshots/${p.replace(/\\/g, '/')}`;
}
</script>

<template>
  <div class="diff">
    <p v-if="!diffSrc" class="empty">No diff image available.</p>
    <img v-else :src="imgSrc(diffSrc)" alt="Pixel diff" />
  </div>
</template>

<style scoped>
.diff { overflow: auto; height: 100%; background: white; }
.diff img { display: block; }
.empty { padding: 2rem; color: var(--muted); }
</style>
