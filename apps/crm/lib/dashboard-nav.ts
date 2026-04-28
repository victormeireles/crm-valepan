import { CLIENT_CATEGORY_VALUES } from "@/lib/client-categories";

export type DashboardNavLink = {
  kind: "link";
  href: string;
  label: string;
};

export type DashboardNavDropdown = {
  kind: "dropdown";
  id: string;
  label: string;
  items: { href: string; label: string }[];
};

export type DashboardNavItem = DashboardNavLink | DashboardNavDropdown;

export const dashboardNavItems: DashboardNavItem[] = [
  { kind: "link", href: "/dashboard", label: "Dashboard" },
  { kind: "link", href: "/inbox", label: "Chat" },
  { kind: "link", href: "/leads", label: "Leads" },
  { kind: "link", href: "/pipeline", label: "Funil" },
  { kind: "link", href: "/tasks", label: "Tarefas" },
  {
    kind: "dropdown",
    id: "client-categories",
    label: "Categorias de cliente",
    items: CLIENT_CATEGORY_VALUES.map((value) => ({
      href: `/leads?client_category=${value}`,
      label: value,
    })),
  },
  { kind: "link", href: "/samples", label: "Amostras" },
];
