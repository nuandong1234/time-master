<script setup lang="ts">
import { useRoute, useRouter } from "vue-router";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { version } from "../../../package.json";

const route = useRoute();
const router = useRouter();

const navItems = [
  { path: "/pomodoro", label: "番茄时钟", icon: "clock" },
  { path: "/collaborate", label: "事项清单", icon: "list" },
  { path: "/workflow", label: "我的项目", icon: "project" },
  ];

function navigate(path: string) {
  router.push(path);
}
</script>

<template>
  <aside
      class="w-fit h-full bg-sidebar border-r border-sidebar-border flex flex-col select-none"
    >
      <div class="flex justify-center py-[10px]">
        <div
          class="size-[36px] rounded-full bg-sidebar-accent flex items-center justify-center ring-1 ring-sidebar-ring select-none"
        >
          <svg
            class="size-[22px] text-sidebar-foreground/60"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
            />
          </svg>
        </div>
      </div>

      <Separator class="bg-sidebar-border" />

      <nav class="flex-1 flex flex-col items-stretch py-4 gap-1">
        <Button
          v-for="item in navItems"
          :key="item.path"
          variant="ghost"
          tabindex="-1"
          :class="[
            'w-full flex-col items-center gap-0.5 px-2 py-1.5 h-auto text-[13px] font-normal',
            route.path === item.path
              ? 'bg-sidebar-accent text-sidebar-accent-foreground'
              : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
          ]"
          @click="navigate(item.path)"
        >
          <svg v-if="item.icon === 'clock'" class="size-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
          <svg v-else-if="item.icon === 'list'" class="size-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
          </svg>
          <svg v-else-if="item.icon === 'project'" class="size-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5 1.5H9.75m7.5 0h2.25m-9.75 0h-2.25"/>
          </svg>
          {{ item.label }}
        </Button>
      </nav>

    <Separator class="bg-sidebar-border" />

    <div class="px-3 py-2">
      <p class="text-[10px] text-sidebar-foreground/40">v{{ version }}</p>
    </div>
  </aside>
</template>
