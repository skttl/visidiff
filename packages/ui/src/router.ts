import { createRouter, createWebHistory } from 'vue-router';
import ResultsView from './views/ResultsView.vue';
import DetailView from './views/DetailView.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'results', component: ResultsView },
    { path: '/url/:id', name: 'detail', component: DetailView, props: true },
  ],
});
