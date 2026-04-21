<script setup lang="ts"></script>

<template>
  <div class="app">
    <header class="app-header">
      <h1>visidiff</h1>
    </header>
    <main>
      <router-view />
    </main>
  </div>
</template>

<style scoped>
.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
.app-header {
  padding: 0.75rem 1.25rem;
  border-bottom: 1px solid #e5e5e5;
}
.app-header h1 {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0;
}
</style>
