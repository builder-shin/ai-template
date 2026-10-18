export function hoistShadows(
  comboModulesYaml: string,
  standaloneModulesYaml: string,
  workspaceLocks?: { readonly combo: string; readonly standalone: string },
): {
  shadowed: readonly { name: string; combo: string; standalone: string }[];
  apiOnly: readonly string[];
};
