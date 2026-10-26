export type Frontend = "web" | "admin" | "mobile";
export function frontendTemplate(app: Frontend): "nextjs" | "nextjs-admin" | "expo" {
  return { web: "nextjs", admin: "nextjs-admin", mobile: "expo" }[app] as
    "nextjs" | "nextjs-admin" | "expo";
}
