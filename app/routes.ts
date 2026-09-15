import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("setup-guide", "routes/setup-guide.tsx"),
  route("workspace/:section?", "routes/workspace.tsx"),
] satisfies RouteConfig;
