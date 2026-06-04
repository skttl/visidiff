<script setup lang="ts">
const headerScrolled = ref(false)

function onWindowScroll() {
  headerScrolled.value = window.scrollY > 8
}

onMounted(() => {
  window.addEventListener('scroll', onWindowScroll, { passive: true })
})

onUnmounted(() => {
  window.removeEventListener('scroll', onWindowScroll)
})
</script>

<template>
  <div class="min-h-screen overflow-x-clip bg-slate-950 text-slate-100 antialiased">
    <div class="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.08),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(34,197,94,0.07),_transparent_24%),linear-gradient(to_bottom,_rgba(15,23,42,0.96),_rgba(2,6,23,1))]" />
    <div class="relative px-4 py-4 sm:px-6 lg:px-8">
      <header
        data-testid="app-header"
        class="sticky top-4 z-20 rounded-[1.5rem] border border-slate-800/80 bg-slate-900/75 px-5 py-3 backdrop-blur-xl transition-shadow duration-300"
        :class="headerScrolled ? 'shadow-[0_8px_32px_-4px_rgba(0,0,0,0.7),0_0_0_1px_rgba(148,163,184,0.08)]' : 'shadow-2xl shadow-black/20'"
      >
        <div class="flex items-center justify-between gap-4">
          <NuxtLink to="/" class="flex items-center gap-2.5 group">
            <img src="/favicon.svg" alt="" class="size-7 shrink-0" />
            <span class="text-sm font-semibold text-slate-100 group-hover:text-white transition">VisiDiff</span>
          </NuxtLink>
          <nav class="flex items-center gap-1">
            <NuxtLink
              to="/runs"
              class="rounded-xl border border-transparent px-3 py-1.5 text-xs text-slate-400 transition hover:border-slate-700 hover:bg-slate-800 hover:text-slate-200"
              active-class="border-slate-800/80 bg-slate-800/60 text-slate-200"
            >
              Saved runs
            </NuxtLink>
            <NuxtLink
              to="/settings"
              class="rounded-xl border border-transparent px-3 py-1.5 text-xs text-slate-400 transition hover:border-slate-700 hover:bg-slate-800 hover:text-slate-200"
              active-class="border-slate-800/80 bg-slate-800/60 text-slate-200"
            >
              Settings
            </NuxtLink>
          </nav>
        </div>
      </header>
      <NuxtPage />
    </div>
  </div>
</template>
