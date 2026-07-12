import { createRouter, createWebHashHistory } from "vue-router";
import PomodoroView from "@/pages/PomodoroView.vue";
import CollaborateView from "@/pages/CollaborateView.vue";
import WorkflowView from "@/pages/WorkflowView.vue";
import SettingsView from "@/pages/SettingsView.vue";

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: "/",
      redirect: "/pomodoro",
    },
    {
      path: "/pomodoro",
      name: "pomodoro",
      component: PomodoroView,
      meta: { title: "番茄时钟" },
    },
    {
      path: "/collaborate",
      name: "collaborate",
      component: CollaborateView,
      meta: { title: "事项清单" },
    },
    {
      path: "/workflow",
      name: "workflow",
      component: WorkflowView,
      meta: { title: "我的项目" },
    },
    {
      path: "/settings",
      name: "settings",
      component: SettingsView,
      meta: { title: "设置" },
    },
  ],
});

export default router;