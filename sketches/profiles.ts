
class Tools {
    // Unser Wrapper erglaubt Tool-Profile
}

class Skill {
    // Unser Wrapper erglaubt Skill-Profile
}

class ContextFile { }

class InitialSessionContext {
    sessionId: string;
    // Skills die dem PI-Coding Agent zur Verfügung stehen
    skills: Skill[]
    // Tools die injeziert werden
    tools: Tools[]
    // Context-Dateien wie `AGENTS.md`
    contextFiles: ContextFile[]

    // Darauf erstellt dann der PI Coding Agent den afänglichen Kontext.
}


class InitialSessionContextBuidler {
    skills: Skill[]
    tools: Tools[]
    contextFiles: ContextFile[]

    addSkills() { }
    addTools() { }
    addContextFiles() { }

    createSession() {
        return new InitialSessionContext(this.skills, this.tools, this.contextFiles);
    }
}

// Das Builder-Pattern ermöglich uns einen initiales Objekt zu erstellen und es durch regel-
// oder sogar KI-basierte Logik zu erweitern. Der PI-Agent kann von uns mit verschiedenen Tool- und Skillprofilen
// gestartet werden. so können wir einerseits zum Beispiel Agent Workspaces erstellen wie zu zum Beispiel
// in OpenClaw. Wir können aber auch regelbasierte Toolzuweisung zur realisieren.
