import { protectedScreens } from "../navigation/features";
/** Router fixtures register the whole protected route table and replace only the screens under test. */
export function protectedRouteStubs(): Record<string, () => null> {
  return Object.fromEntries(protectedScreens.map((item) => [`(app)/${item.name}`, () => null]));
}
