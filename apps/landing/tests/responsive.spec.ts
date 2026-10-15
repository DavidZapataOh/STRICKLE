import { responsiveSuite } from "@strickle/gates";

responsiveSuite(["/en", "/es", "/pt-br"], { contentSelector: ".wrap" });
