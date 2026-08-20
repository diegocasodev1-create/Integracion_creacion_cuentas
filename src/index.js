import { routeRequest } from "./router.js";

export default {
  async fetch(request, env) {
    return routeRequest(request, env);
  },
};
