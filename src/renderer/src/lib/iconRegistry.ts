import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  BarChart3,
  Building2,
  CalendarClock,
  ClipboardList,
  Clock,
  CreditCard,
  Database,
  FileSpreadsheet,
  FileText,
  FlaskConical,
  HeartPulse,
  Hospital,
  Inbox,
  KeyRound,
  LayoutDashboard,
  LineChart,
  Lock,
  Package,
  Pill,
  Receipt,
  Settings as SettingsIcon,
  Shield,
  ShieldCheck,
  Stethoscope,
  Tag,
  TrendingUp,
  Truck,
  User,
  UserCheck,
  UserCog,
  UserSquare2,
  Users,
  Vault,
  Wallet,
  type LucideIcon,
} from "lucide-react"

/**
 * Static map from the icon-name strings declared in `NAV_CONFIG` to the
 * concrete Lucide React components they reference.
 *
 * Listing every referenced icon here (instead of dynamic `import()`)
 * means Vite can tree-shake unused Lucide icons out of the bundle. We
 * rely on the import list being a closed set: when a new icon is added
 * to the navigation config, add it here too.
 */
export const ICON_REGISTRY: Record<string, LucideIcon> = {
  Activity,
  AlertTriangle,
  BadgeCheck,
  BarChart3,
  Building2,
  CalendarClock,
  ClipboardList,
  Clock,
  CreditCard,
  Database,
  FileSpreadsheet,
  FileText,
  FlaskConical,
  HeartPulse,
  Hospital,
  Inbox,
  KeyRound,
  LayoutDashboard,
  LineChart,
  Lock,
  Package,
  Pill,
  Receipt,
  Settings: SettingsIcon,
  Shield,
  ShieldCheck,
  Stethoscope,
  Tag,
  TrendingUp,
  Truck,
  User,
  UserCheck,
  UserCog,
  UserSquare2,
  Users,
  Vault,
  Wallet,
}

export function getIcon(name: string): LucideIcon {
  return ICON_REGISTRY[name] ?? Inbox
}
