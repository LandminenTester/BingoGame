import { createRouter, createWebHistory } from 'vue-router';
import { useSessionStore } from '../stores/session';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'landing', component: () => import('../views/LandingView.vue') },
    { path: '/lobby/join', name: 'guest-join', component: () => import('../views/GuestJoinView.vue') },
    {
      path: '/guest/lobby/:lobbyId',
      name: 'guest-lobby',
      component: () => import('../views/LiveLobbyView.vue'),
      props: true,
      meta: { requiresGuestLobby: true },
    },
    {
      path: '/app',
      component: () => import('../views/AuthenticatedShell.vue'),
      meta: { requiresAuth: true },
      children: [
        { path: '', redirect: { name: 'templates' } },
        { path: 'templates', name: 'templates', component: () => import('../views/TemplatesView.vue') },
        {
          path: 'lobby/new',
          name: 'create-lobby',
          component: () => import('../views/CreateLobbyView.vue'),
        },
        { path: 'lobby/:lobbyId', name: 'app-lobby', component: () => import('../views/LiveLobbyView.vue'), props: true },
        {
          path: 'history',
          name: 'history',
          component: () => import('../views/HistoryView.vue'),
          children: [
            { path: 'stats', name: 'stats', component: () => import('../views/StatsView.vue') },
          ],
        },
        { path: 'settings', name: 'settings', component: () => import('../views/SettingsView.vue') },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

router.beforeEach(async (to) => {
  const session = useSessionStore();
  if (session.status === 'unknown') await session.bootstrap();

  if (to.meta.requiresAuth && session.status === 'anonymous') return { name: 'landing' };
  if (to.meta.requiresGuestLobby && session.status === 'anonymous') return { name: 'guest-join' };
  if (to.name === 'landing' && session.status !== 'anonymous') return { name: 'templates' };
  return true;
});

export default router;
