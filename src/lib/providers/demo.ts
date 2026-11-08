import { randomUUID } from "node:crypto";
import type { Brief, Scene } from "../schema";
import type { TextProvider } from "./text";

const copy = {
  en: {
    headings: ["Hook", "The big idea", "A closer look", "Takeaway"],
    lines: [
      "What makes {topic} worth a closer look? [Add a compelling, verified opening fact.]",
      "Let’s unpack {topic}. [Explain the central idea in your own words; verify it with reliable sources.]",
      "[Add a specific example about {topic}. Explain why it matters and cite your research notes.]",
      "What will you take away from {topic}? [Summarize the verified insight and invite a relevant question.]",
    ],
    visual: "[Plan original visuals or licensed footage for this scene.]",
  },
  sv: {
    headings: ["Inledning", "Huvudidé", "Fördjupning", "Avslutning"],
    lines: [
      "Varför är {topic} värt att utforska? [Lägg till en verifierad inledande uppgift.]",
      "Vi undersöker {topic}. [Förklara huvudidén med egna ord och kontrollera källorna.]",
      "[Ge ett konkret exempel om {topic} och förklara varför det är relevant.]",
      "Vad tar du med dig om {topic}? [Sammanfatta och ställ en relevant fråga.]",
    ],
    visual: "[Planera eget bildmaterial eller licensierade klipp.]",
  },
  es: {
    headings: ["Gancho", "Idea principal", "En detalle", "Conclusión"],
    lines: [
      "¿Por qué explorar {topic}? [Añade un dato inicial verificado.]",
      "Exploremos {topic}. [Explica la idea central con tus palabras y fuentes fiables.]",
      "[Añade un ejemplo concreto sobre {topic} y explica su importancia.]",
      "¿Qué aprendimos sobre {topic}? [Resume la idea verificada e invita a comentar.]",
    ],
    visual: "[Planifica imágenes originales o material con licencia.]",
  },
  fr: {
    headings: ["Accroche", "Idée principale", "En détail", "Conclusion"],
    lines: [
      "Pourquoi explorer {topic} ? [Ajoutez un fait vérifié pour commencer.]",
      "Explorons {topic}. [Expliquez l’idée centrale avec vos mots et des sources fiables.]",
      "[Ajoutez un exemple concret sur {topic} et expliquez son importance.]",
      "Que retenir de {topic} ? [Résumez l’idée vérifiée et posez une question pertinente.]",
    ],
    visual: "[Prévoyez des images originales ou sous licence.]",
  },
  de: {
    headings: ["Einstieg", "Kernidee", "Ein genauer Blick", "Fazit"],
    lines: [
      "Warum lohnt sich ein Blick auf {topic}? [Ergänze eine überprüfte Einstiegsinformation.]",
      "Wir erkunden {topic}. [Erkläre die Kernidee mit eigenen Worten und zuverlässigen Quellen.]",
      "[Ergänze ein konkretes Beispiel zu {topic} und erkläre seine Bedeutung.]",
      "Was nehmen wir über {topic} mit? [Fasse die geprüfte Erkenntnis zusammen und stelle eine Frage.]",
    ],
    visual: "[Plane eigene Bilder oder lizenziertes Filmmaterial.]",
  },
};
export class DemoProvider implements TextProvider {
  readonly id = "demo" as const;
  async generate(brief: Brief): Promise<Scene[]> {
    const c = copy[brief.language];
    const count = brief.format === "short" ? 4 : 8;
    return Array.from({ length: count }, (_, i) => {
      const slot = i === 0 ? 0 : i === count - 1 ? 3 : i % 2 === 1 ? 1 : 2;
      return {
        id: randomUUID(),
        heading: `${String(i + 1).padStart(2, "0")} · ${c.headings[slot]}`,
        narration: c.lines[slot].replaceAll("{topic}", brief.topic),
        visual: c.visual,
        duration:
          Math.floor(brief.duration / count) +
          (i < brief.duration % count ? 1 : 0),
      };
    });
  }
}
