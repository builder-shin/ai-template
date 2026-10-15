export function hoistShadows(
  comboModulesYaml: string,
  standaloneModulesYaml: string,
): {
  shadowed: readonly { name: string; combo: string; standalone: string }[];
  apiOnly: readonly string[];
};
