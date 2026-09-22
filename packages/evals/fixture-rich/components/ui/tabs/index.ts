import type { VariantProps } from "class-variance-authority"

import { tabsListVariants } from "./variants"

export { default as Tabs } from "./Tabs.vue"
export { default as TabsList } from "./TabsList.vue"
export { default as TabsTrigger } from "./TabsTrigger.vue"
export { default as TabsContent } from "./TabsContent.vue"
export { tabsListVariants }
export type TabsListVariants = VariantProps<typeof tabsListVariants>
