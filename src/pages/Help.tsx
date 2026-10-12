import { useState, useCallback } from "react";

type Section = "overview" | "decks" | "quizzes" | "import" | "stats";

export function Help() {
  const [activeSection, setActiveSection] = useState<Section>("overview");

  const sections: { id: Section; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "decks", label: "Decks & Study" },
    { id: "quizzes", label: "Quizzes" },
    { id: "import", label: "Import/Export" },
    { id: "stats", label: "Statistics" },
  ];

  return (
    <div className="min-h-full bg-[#2d2a2e]">
      <main className="max-w-5xl mx-auto py-6 px-6">
        <div className="fade-in">
          <h1 className="text-2xl font-bold text-[#fcfcfa] font-mono mb-6">Help & Documentation</h1>

          {/* Section Tabs */}
          <div className="flex flex-wrap gap-2 mb-6">
            {sections.map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeSection === section.id
                    ? "bg-[#ffd866] text-[#2d2a2e]"
                    : "bg-[#5b595c] text-[#fcfcfa] hover:bg-[#5b595c]/80"
                }`}
              >
                {section.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="bg-[#403e41] rounded-xl border border-[#5b595c] p-6">
            {activeSection === "overview" && <OverviewSection />}
            {activeSection === "decks" && <DecksSection />}
            {activeSection === "quizzes" && <QuizzesSection />}
            {activeSection === "import" && <ImportSection />}
            {activeSection === "stats" && <StatsSection />}
          </div>
        </div>
      </main>
    </div>
  );
}

function OverviewSection() {
  return (
    <div className="prose prose-invert max-w-none">
      <h2 className="text-xl font-semibold text-[#fcfcfa] mb-4">Welcome to Kioku</h2>

      <p className="text-[#939293] mb-4">
        Kioku is a local-first flashcard and quiz application designed for studying and testing your knowledge.
        All your data is stored locally on your device.
      </p>

      <h3 className="text-lg font-medium text-[#ffd866] mt-6 mb-3">Key Features</h3>

      <div className="grid gap-4 md:grid-cols-2">
        <FeatureCard
          title="Flashcard Decks"
          description="Create decks of flashcards with text or code content. Study with flip cards, keyboard navigation, and swipe gestures."
          color="#a9dc76"
        />
        <FeatureCard
          title="Quizzes"
          description="Create quizzes with multiple choice or fill-in-the-blank questions. Track scores and review your answers."
          color="#78dce8"
        />
        <FeatureCard
          title="Tags & Filtering"
          description="Organize cards and questions with tags. Filter by tags when studying or reviewing."
          color="#ab9df2"
        />
        <FeatureCard
          title="Code Support"
          description="Add code snippets with syntax highlighting. Supports 50+ programming languages."
          color="#fc9867"
        />
        <FeatureCard
          title="Import/Export"
          description="Import decks and quizzes from JSON files. Export your content to share or backup."
          color="#ffd866"
        />
        <FeatureCard
          title="Statistics"
          description="Track your study time, cards reviewed, quiz attempts, and scores."
          color="#ff6188"
        />
      </div>

      <h3 className="text-lg font-medium text-[#ffd866] mt-6 mb-3">Navigation</h3>

      <ul className="text-[#939293] space-y-2">
        <li><span className="text-[#fcfcfa]">Decks</span> - View and manage your flashcard decks</li>
        <li><span className="text-[#fcfcfa]">Quizzes</span> - View and manage your quizzes</li>
        <li><span className="text-[#fcfcfa]">Stats</span> - View your study statistics</li>
        <li><span className="text-[#fcfcfa]">Settings</span> - Manage your account and data (via user menu)</li>
      </ul>
    </div>
  );
}

function DecksSection() {
  return (
    <div className="prose prose-invert max-w-none">
      <h2 className="text-xl font-semibold text-[#fcfcfa] mb-4">Decks & Study Mode</h2>

      <h3 className="text-lg font-medium text-[#a9dc76] mt-6 mb-3">Creating a Deck</h3>
      <ol className="text-[#939293] space-y-2 list-decimal list-inside">
        <li>Click <span className="text-[#ffd866]">+ New Deck</span> on the Decks page</li>
        <li>Enter a name and optional description</li>
        <li>Toggle <span className="text-[#ab9df2]">Shuffle Cards</span> if you want cards randomized when studying</li>
        <li>Click <span className="text-[#ffd866]">Create Deck</span></li>
      </ol>

      <h3 className="text-lg font-medium text-[#a9dc76] mt-6 mb-3">Adding Cards</h3>
      <ol className="text-[#939293] space-y-2 list-decimal list-inside">
        <li>Open a deck by clicking on it</li>
        <li>Click <span className="text-[#ffd866]">+ Add Card</span></li>
        <li>Enter the front (question) and back (answer)</li>
        <li>Optionally add notes and tags</li>
        <li>For code content, click the edit icon to switch to code mode</li>
      </ol>

      <h3 className="text-lg font-medium text-[#a9dc76] mt-6 mb-3">Study Mode</h3>
      <p className="text-[#939293] mb-3">
        Click <span className="text-[#a9dc76]">Study</span> on any deck to enter study mode.
      </p>

      <div className="bg-[#2d2a2e] rounded-lg p-4 mb-4">
        <h4 className="text-[#fcfcfa] font-medium mb-2">Controls</h4>
        <ul className="text-[#939293] space-y-1 text-sm">
          <li><kbd className="px-2 py-0.5 bg-[#5b595c] rounded text-xs">Space</kbd> or <kbd className="px-2 py-0.5 bg-[#5b595c] rounded text-xs">Enter</kbd> - Flip card</li>
          <li><kbd className="px-2 py-0.5 bg-[#5b595c] rounded text-xs">←</kbd> - Previous card</li>
          <li><kbd className="px-2 py-0.5 bg-[#5b595c] rounded text-xs">→</kbd> - Next card</li>
          <li><span className="text-[#78dce8]">Swipe left/right</span> - Navigate cards (touch)</li>
          <li><span className="text-[#78dce8]">Click/Tap card</span> - Flip card</li>
        </ul>
      </div>

      <h3 className="text-lg font-medium text-[#a9dc76] mt-6 mb-3">Tag Filtering</h3>
      <p className="text-[#939293] mb-3">
        If a deck has tags, you can filter cards before studying:
      </p>
      <ul className="text-[#939293] space-y-1">
        <li>Click tags to select/deselect them</li>
        <li>Use <span className="text-[#ab9df2]">Any</span> mode to show cards with any selected tag</li>
        <li>Use <span className="text-[#ab9df2]">All</span> mode to show cards with all selected tags</li>
        <li>Click <span className="text-[#a9dc76]">Study Filtered</span> to study only matching cards</li>
      </ul>

      <h3 className="text-lg font-medium text-[#a9dc76] mt-6 mb-3">Autoplay Mode</h3>
      <p className="text-[#939293]">
        Click <span className="text-[#78dce8]">Autoplay</span> on a deck to have cards automatically cycle through with text-to-speech.
        Configure which sides to show (front, back, or both), pause duration, and playback settings.
        Useful for hands-free review, audio learning, or accessibility.
      </p>
    </div>
  );
}

function QuizzesSection() {
  return (
    <div className="prose prose-invert max-w-none">
      <h2 className="text-xl font-semibold text-[#fcfcfa] mb-4">Quizzes</h2>

      <h3 className="text-lg font-medium text-[#78dce8] mt-6 mb-3">Creating a Quiz</h3>
      <ol className="text-[#939293] space-y-2 list-decimal list-inside">
        <li>Click <span className="text-[#ffd866]">+ New Quiz</span> on the Quizzes page</li>
        <li>Enter a name and optional description</li>
        <li>Toggle <span className="text-[#ab9df2]">Shuffle Questions</span> if desired</li>
        <li>Click <span className="text-[#ffd866]">Create Quiz</span></li>
      </ol>

      <h3 className="text-lg font-medium text-[#78dce8] mt-6 mb-3">Question Types</h3>

      <div className="space-y-4">
        <div className="bg-[#2d2a2e] rounded-lg p-4">
          <h4 className="text-[#fcfcfa] font-medium mb-2">Multiple Choice</h4>
          <ul className="text-[#939293] space-y-1 text-sm">
            <li>Add 2-6 answer choices</li>
            <li>Mark one or more as correct</li>
            <li>Enable "Multiple Answers" for select-all-that-apply questions</li>
          </ul>
        </div>

        <div className="bg-[#2d2a2e] rounded-lg p-4">
          <h4 className="text-[#fcfcfa] font-medium mb-2">Fill in the Blank</h4>
          <ul className="text-[#939293] space-y-1 text-sm">
            <li>Write a question with a blank to fill</li>
            <li>Specify the exact correct answer</li>
            <li>Answers are case-sensitive</li>
          </ul>
        </div>
      </div>

      <h3 className="text-lg font-medium text-[#78dce8] mt-6 mb-3">Taking a Quiz</h3>
      <ol className="text-[#939293] space-y-2 list-decimal list-inside">
        <li>Click <span className="text-[#a9dc76]">Take Quiz</span> on any quiz</li>
        <li>Answer each question and click <span className="text-[#ffd866]">Submit Answer</span></li>
        <li>View immediate feedback and explanations</li>
        <li>Click <span className="text-[#ffd866]">Next Question</span> to continue</li>
        <li>At the end, see your score and review all answers</li>
      </ol>

      <h3 className="text-lg font-medium text-[#78dce8] mt-6 mb-3">Quiz Results</h3>
      <p className="text-[#939293]">
        After completing a quiz, you'll see your score with color coding:
      </p>
      <ul className="text-[#939293] space-y-1 mt-2">
        <li><span className="text-[#a9dc76]">Green (80%+)</span> - Excellent</li>
        <li><span className="text-[#ffd866]">Yellow (60-79%)</span> - Good</li>
        <li><span className="text-[#ff6188]">Red (&lt;60%)</span> - Needs practice</li>
      </ul>
    </div>
  );
}

function ImportSection() {
  return (
    <div className="prose prose-invert max-w-none">
      <h2 className="text-xl font-semibold text-[#fcfcfa] mb-4">Import & Export</h2>

      <h3 className="text-lg font-medium text-[#ffd866] mt-6 mb-3">Importing</h3>
      <p className="text-[#939293] mb-3">
        Import decks, quizzes, or whole courses from JSON files:
      </p>
      <ul className="text-[#939293] space-y-1">
        <li>Click <span className="text-[#5b595c] bg-[#5b595c]/30 px-2 py-0.5 rounded">Import Deck</span> or <span className="text-[#5b595c] bg-[#5b595c]/30 px-2 py-0.5 rounded">Import Quiz</span></li>
        <li>Click <span className="text-[#5b595c] bg-[#5b595c]/30 px-2 py-0.5 rounded">Import Course</span> on the Courses page for a full course bundle</li>
        <li>Or drag and drop a JSON file onto the matching page</li>
      </ul>

      <h3 className="text-lg font-medium text-[#ffd866] mt-6 mb-3">Exporting</h3>
      <p className="text-[#939293] mb-3">
        Export a deck or quiz from its page (or several at once from Settings → Data
        Management), and a course from its page using the Export button.
      </p>

      <h3 className="text-lg font-medium text-[#ffd866] mt-6 mb-3">Deck JSON Schema</h3>
      <CodeBlock
        label="Copy Schema"
        code={`{
  "name": "Deck Name",
  "description": "Optional description",
  "shuffleCards": false,
  "cards": [
    {
      "front": "Question text",
      "back": "Answer text",
      "frontType": "TEXT",
      "backType": "TEXT",
      "frontLanguage": null,
      "backLanguage": null,
      "notes": "Optional notes",
      "tags": ["tag1", "tag2"]
    }
  ]
}`}
      />

      <h4 className="text-md font-medium text-[#fcfcfa] mt-4 mb-2">Deck Fields</h4>
      <div className="overflow-x-auto mb-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#5b595c]">
              <th className="text-left py-2 text-[#939293]">Field</th>
              <th className="text-left py-2 text-[#939293]">Required</th>
              <th className="text-left py-2 text-[#939293]">Description</th>
            </tr>
          </thead>
          <tbody className="text-[#939293]">
            <tr className="border-b border-[#5b595c]/50">
              <td className="py-2 text-[#78dce8]">name</td>
              <td>Yes</td>
              <td>Name of the deck</td>
            </tr>
            <tr className="border-b border-[#5b595c]/50">
              <td className="py-2 text-[#78dce8]">description</td>
              <td>No</td>
              <td>Description of the deck</td>
            </tr>
            <tr className="border-b border-[#5b595c]/50">
              <td className="py-2 text-[#78dce8]">shuffleCards</td>
              <td>No</td>
              <td>Randomize card order when studying (default: false)</td>
            </tr>
            <tr>
              <td className="py-2 text-[#78dce8]">cards</td>
              <td>Yes</td>
              <td>Array of card objects</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h4 className="text-md font-medium text-[#fcfcfa] mt-4 mb-2">Card Fields</h4>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#5b595c]">
              <th className="text-left py-2 text-[#939293]">Field</th>
              <th className="text-left py-2 text-[#939293]">Required</th>
              <th className="text-left py-2 text-[#939293]">Description</th>
            </tr>
          </thead>
          <tbody className="text-[#939293]">
            <tr className="border-b border-[#5b595c]/50">
              <td className="py-2 text-[#78dce8]">front</td>
              <td>Yes</td>
              <td>Front side content</td>
            </tr>
            <tr className="border-b border-[#5b595c]/50">
              <td className="py-2 text-[#78dce8]">back</td>
              <td>Yes</td>
              <td>Back side content</td>
            </tr>
            <tr className="border-b border-[#5b595c]/50">
              <td className="py-2 text-[#78dce8]">frontType/backType</td>
              <td>No</td>
              <td>"TEXT" or "CODE" (default: TEXT)</td>
            </tr>
            <tr className="border-b border-[#5b595c]/50">
              <td className="py-2 text-[#78dce8]">frontLanguage/backLanguage</td>
              <td>No</td>
              <td>Language for syntax highlighting</td>
            </tr>
            <tr className="border-b border-[#5b595c]/50">
              <td className="py-2 text-[#78dce8]">notes</td>
              <td>No</td>
              <td>Additional notes or hints</td>
            </tr>
            <tr>
              <td className="py-2 text-[#78dce8]">tags</td>
              <td>No</td>
              <td>Array of tag names</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3 className="text-lg font-medium text-[#ffd866] mt-6 mb-3">Quiz JSON Schema</h3>
      <CodeBlock
        label="Copy Schema"
        code={`{
  "name": "Quiz Name",
  "description": "Optional description",
  "shuffleQuestions": false,
  "questions": [
    {
      "type": "multiple_choice",
      "content": "Question text",
      "contentType": "TEXT",
      "choices": [
        { "text": "Option A", "isCorrect": false },
        { "text": "Option B", "isCorrect": true }
      ],
      "multipleAnswers": false,
      "explanation": "Why B is correct",
      "tags": ["topic1"]
    },
    {
      "type": "fill_in_blank",
      "content": "Complete: Hello _____",
      "correctAnswer": "World",
      "explanation": "Classic greeting",
      "tags": ["basics"]
    }
  ]
}`}
      />

      <h3 className="text-lg font-medium text-[#ffd866] mt-6 mb-3">Course JSON Schema</h3>
      <p className="text-[#939293] mb-3 text-sm">
        A course bundles its own lessons and content. On import, the decks, quizzes, and
        notes below are copied into the course itself — they are <em>not</em> added to your
        personal library — and each lesson item links to one by matching its{" "}
        <span className="text-[#78dce8]">type</span> and <span className="text-[#78dce8]">name</span>.
        Tags on course content are not stored.
      </p>
      <CodeBlock
        label="Copy Schema"
        code={`{
  "name": "Course Name",
  "description": "Optional description",
  "lessons": [
    {
      "title": "Lesson 1",
      "description": "Optional lesson description",
      "items": [
        { "type": "deck", "name": "Deck Name" },
        { "type": "quiz", "name": "Quiz Name", "requirementType": "min_score", "requirementValue": 80 },
        { "type": "note", "name": "Note Name" }
      ]
    }
  ],
  "decks": [
    { "name": "Deck Name", "description": null, "shuffleCards": false, "cards": [ /* see Deck schema */ ] }
  ],
  "quizzes": [
    { "name": "Quiz Name", "description": null, "shuffleQuestions": false, "questions": [ /* see Quiz schema */ ] }
  ],
  "notes": [
    { "name": "Note Name", "content": "Note body" }
  ]
}`}
      />

      <h4 className="text-md font-medium text-[#fcfcfa] mt-4 mb-2">Lesson Item Fields</h4>
      <div className="overflow-x-auto mb-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#5b595c]">
              <th className="text-left py-2 text-[#939293]">Field</th>
              <th className="text-left py-2 text-[#939293]">Required</th>
              <th className="text-left py-2 text-[#939293]">Description</th>
            </tr>
          </thead>
          <tbody className="text-[#939293]">
            <tr className="border-b border-[#5b595c]/50">
              <td className="py-2 text-[#78dce8]">type</td>
              <td>Yes</td>
              <td>"deck", "quiz", or "note"</td>
            </tr>
            <tr className="border-b border-[#5b595c]/50">
              <td className="py-2 text-[#78dce8]">name</td>
              <td>Yes</td>
              <td>Matches a decks/quizzes/notes entry to link it into the lesson</td>
            </tr>
            <tr className="border-b border-[#5b595c]/50">
              <td className="py-2 text-[#78dce8]">requirementType</td>
              <td>No</td>
              <td>e.g. "min_score" to gate lesson completion on a quiz result</td>
            </tr>
            <tr>
              <td className="py-2 text-[#78dce8]">requirementValue</td>
              <td>No</td>
              <td>Threshold for the requirement (e.g. 80 for 80%)</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h4 className="text-md font-medium text-[#fcfcfa] mt-4 mb-2">Supported Languages</h4>
      <p className="text-[#939293] text-sm mb-2">
        For code content, use one of these language identifiers:
      </p>
      <div className="bg-[#2d2a2e] rounded-lg p-3 text-xs text-[#939293] font-mono">
        JAVASCRIPT, TYPESCRIPT, PYTHON, JAVA, RUST, GO, CPP, C, CSHARP, HTML, CSS, SQL, JSON, YAML, BASH, DOCKER, MARKDOWN, RUBY, PHP, SWIFT, KOTLIN, SCALA, R, LUA, HASKELL, ELIXIR, DART, GRAPHQL, TOML, and more...
      </div>
    </div>
  );
}

function StatsSection() {
  return (
    <div className="prose prose-invert max-w-none">
      <h2 className="text-xl font-semibold text-[#fcfcfa] mb-4">Statistics</h2>

      <p className="text-[#939293] mb-4">
        Kioku tracks your study activity to help you monitor your progress.
      </p>

      <h3 className="text-lg font-medium text-[#a9dc76] mt-6 mb-3">Deck Statistics</h3>
      <p className="text-[#939293] mb-3">
        For each deck, the following is tracked:
      </p>
      <ul className="text-[#939293] space-y-1">
        <li><span className="text-[#ffd866]">Study Sessions</span> - Number of times you've studied the deck</li>
        <li><span className="text-[#a9dc76]">Study Time</span> - Total time spent studying</li>
        <li><span className="text-[#78dce8]">Cards Studied</span> - Number of cards reviewed</li>
        <li><span className="text-[#939293]">Last Studied</span> - When you last studied the deck</li>
      </ul>

      <h3 className="text-lg font-medium text-[#78dce8] mt-6 mb-3">Quiz Statistics</h3>
      <p className="text-[#939293] mb-3">
        For each quiz, the following is tracked:
      </p>
      <ul className="text-[#939293] space-y-1">
        <li><span className="text-[#ab9df2]">Attempts</span> - Number of times you've taken the quiz</li>
        <li><span className="text-[#a9dc76]">Best Score</span> - Your highest percentage score</li>
        <li><span className="text-[#939293]">Average Score</span> - Average across all attempts</li>
        <li><span className="text-[#939293]">Average Time</span> - How long quizzes typically take</li>
        <li><span className="text-[#939293]">Last Attempt</span> - When you last took the quiz</li>
      </ul>

      <h3 className="text-lg font-medium text-[#ffd866] mt-6 mb-3">Viewing Statistics</h3>
      <p className="text-[#939293]">
        Click <span className="text-[#fcfcfa]">Stats</span> in the navigation bar to view:
      </p>
      <ul className="text-[#939293] space-y-1 mt-2">
        <li>Overall summary with totals</li>
        <li>Per-deck breakdown table</li>
        <li>Per-quiz breakdown table</li>
      </ul>

      <div className="bg-[#2d2a2e] rounded-lg p-4 mt-4">
        <p className="text-[#939293] text-sm">
          <span className="text-[#ffd866]">Note:</span> Statistics are stored separately from your decks and quizzes.
          If you delete a deck or quiz, its statistics are also removed.
        </p>
      </div>
    </div>
  );
}

function FeatureCard({ title, description, color }: { title: string; description: string; color: string }) {
  return (
    <div className="bg-[#2d2a2e] rounded-lg p-4 border-l-4" style={{ borderColor: color }}>
      <h4 className="font-medium text-[#fcfcfa] mb-1">{title}</h4>
      <p className="text-sm text-[#939293]">{description}</p>
    </div>
  );
}

function CodeBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }, [code]);

  return (
    <div className="relative group">
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 px-2 py-1 text-xs rounded bg-[#5b595c] hover:bg-[#5b595c]/80 text-[#fcfcfa] opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1"
        title="Copy to clipboard"
      >
        {copied ? (
          <>
            <svg className="w-3.5 h-3.5 text-[#a9dc76]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Copied!
          </>
        ) : (
          <>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            {label || "Copy"}
          </>
        )}
      </button>
      <pre className="bg-[#2d2a2e] rounded-lg p-4 overflow-x-auto text-sm select-all cursor-text">
        <code className="text-[#a9dc76]">{code}</code>
      </pre>
    </div>
  );
}
