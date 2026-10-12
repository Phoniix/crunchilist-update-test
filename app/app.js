import { createData } from "./prism-data.js";
import { createHome } from "./prism-home.js";
import { startPrism } from "./prism.js";

startPrism(createData(), createHome());
