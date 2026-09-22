import type { VariantProps } from "class-variance-authority"

import { badgeVariants } from "./variants"

export { default as Badge } from "./Badge.vue"
export { badgeVariants }
export type BadgeVariants = VariantProps<typeof badgeVariants>
