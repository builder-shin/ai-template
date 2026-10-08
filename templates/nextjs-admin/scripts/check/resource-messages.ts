import { resources } from "../../src/resources";
import { missingResourceMessages } from "../../src/lib/resources/messages";
import ko from "../../messages/ko.json";
import en from "../../messages/en.json";
const errors = missingResourceMessages(resources, { ko, en });
if (errors.length) {
  process.stderr.write(errors.join("\n") + "\n");
  process.exitCode = 1;
}
