import { ref, onMounted } from 'vue';
import { fetchRunData } from '../api.js';
import type { RunData } from '../types.js';

export function useRunData() {
  const data = ref<RunData | null>(null);
  const loading = ref(true);
  const error = ref<string | null>(null);

  async function load() {
    loading.value = true;
    error.value = null;
    try {
      data.value = await fetchRunData();
    } catch (err) {
      error.value = (err as Error).message;
    } finally {
      loading.value = false;
    }
  }

  onMounted(load);

  return { data, loading, error, reload: load };
}
