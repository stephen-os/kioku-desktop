import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { open } from "@tauri-apps/plugin-dialog";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { useSettings } from "@/context/SettingsContext";
import { importDeck, importQuiz, deleteUser, updateUser } from "@/lib/db";
import { AvatarPicker, AvatarDisplay } from "@/components/AvatarPicker";
import { TtsSettings, Toggle } from "@/components";
import { AVATARS, type AvatarId } from "@/types";

const DEFAULT_AVATAR: AvatarId = "avatar-smile";

function isValidAvatar(avatar: string | undefined): avatar is AvatarId {
  return avatar !== undefined && (AVATARS as readonly string[]).includes(avatar);
}

export function Settings() {
  const navigate = useNavigate();
  const { user, logout, refreshUser, refreshUsers } = useAuth();
  const { settings, updateEditor, resetToDefaults } = useSettings();
  const toast = useToast();
  const [loggingOut, setLoggingOut] = useState(false);
  const [importingDeck, setImportingDeck] = useState(false);
  const [importingQuiz, setImportingQuiz] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Profile editing state
  const [editingProfile, setEditingProfile] = useState(false);
  const [editName, setEditName] = useState(user?.name || "");
  const [editAvatar, setEditAvatar] = useState<AvatarId>(isValidAvatar(user?.avatar) ? user.avatar : DEFAULT_AVATAR);
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    if (user) {
      setEditName(user.name);
      setEditAvatar(isValidAvatar(user.avatar) ? user.avatar : DEFAULT_AVATAR);
    }
  }, [user]);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      navigate("/login");
    } catch (error) {
      console.error("Logout failed:", error);
    } finally {
      setLoggingOut(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!user || !editName.trim()) return;

    setSavingProfile(true);
    try {
      await updateUser(user.id, editName.trim(), undefined, editAvatar);
      await refreshUser();
      setEditingProfile(false);
      toast.success("Profile updated successfully");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update profile");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingProfile(false);
    setEditName(user?.name || "");
    setEditAvatar(isValidAvatar(user?.avatar) ? user.avatar : DEFAULT_AVATAR);
  };

  const handleImportDeck = async () => {
    setImportingDeck(true);

    try {
      const filePath = await open({
        multiple: false,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });

      if (!filePath) {
        setImportingDeck(false);
        return;
      }

      const result = await importDeck(filePath as string);

      toast.success(`Imported "${result.deck.name}" with ${result.cardsImported} cards`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed");
    } finally {
      setImportingDeck(false);
    }
  };

  const handleImportQuiz = async () => {
    setImportingQuiz(true);

    try {
      const filePath = await open({
        multiple: false,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });

      if (!filePath) {
        setImportingQuiz(false);
        return;
      }

      const result = await importQuiz(filePath as string);

      toast.success(`Imported "${result.quiz.name}" with ${result.questionsImported} questions`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed");
    } finally {
      setImportingQuiz(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user || deleteConfirmText !== "DELETE") return;

    setDeleting(true);
    try {
      await deleteUser(user.id);
      await logout();
      await refreshUsers();
      navigate("/login");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete account");
      setDeleting(false);
    }
  };

  return (
    <div className="min-h-full bg-[#2d2a2e]">
      <main className="max-w-3xl mx-auto py-6 px-6">
        <div className="fade-in">
          <h1 className="text-2xl font-bold text-[#fcfcfa] font-mono mb-6">Settings</h1>

          {/* Account Section */}
          <section className="bg-[#403e41] rounded-xl border border-[#5b595c] p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-[#fcfcfa]">Account</h2>
              {!editingProfile && (
                <button
                  onClick={() => setEditingProfile(true)}
                  className="text-sm text-[#78dce8] hover:text-[#ffd866] transition-colors"
                >
                  Edit Profile
                </button>
              )}
            </div>

            <div className="space-y-4">
              {editingProfile ? (
                <div className="space-y-4">
                  {/* Avatar Picker */}
                  <div>
                    <label className="block text-sm text-[#939293] uppercase tracking-wider mb-3 text-center">
                      Choose Avatar
                    </label>
                    <AvatarPicker
                      selected={editAvatar}
                      onSelect={setEditAvatar}
                      size="md"
                    />
                  </div>

                  {/* Name Input */}
                  <div>
                    <label className="block text-sm text-[#939293] uppercase tracking-wider mb-2">
                      Name
                    </label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Enter your name"
                      className="w-full px-4 py-3 bg-[#2d2a2e] border border-[#5b595c] rounded-lg text-[#fcfcfa] placeholder-[#939293] focus:outline-none focus:border-[#ffd866] focus:ring-1 focus:ring-[#ffd866]/50"
                    />
                  </div>

                  {/* Save/Cancel Buttons */}
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={handleSaveProfile}
                      disabled={savingProfile || !editName.trim()}
                      className="flex-1 px-4 py-2 bg-[#ffd866] text-[#2d2a2e] rounded-lg hover:bg-[#ffd866]/90 font-medium transition-colors disabled:opacity-50"
                    >
                      {savingProfile ? "Saving..." : "Save Changes"}
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      className="flex-1 px-4 py-2 border border-[#5b595c] text-[#fcfcfa] rounded-lg hover:bg-[#5b595c]/30 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between p-4 bg-[#78dce8]/10 border border-[#78dce8]/30 rounded-lg">
                  <div className="flex items-center gap-4">
                    <AvatarDisplay avatar={user?.avatar || "avatar-smile"} size="lg" />
                    <div>
                      <p className="font-medium text-[#fcfcfa] text-lg">{user?.name}</p>
                      <p className="text-sm text-[#939293]">
                        Local Account {user?.hasPassword ? "(Password Protected)" : ""}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="pt-4 border-t border-[#5b595c]">
                <button
                  onClick={handleLogout}
                  className="px-4 py-2 bg-[#5b595c] text-[#fcfcfa] rounded-lg hover:bg-[#5b595c]/80 font-medium transition-colors disabled:opacity-50"
                  disabled={loggingOut}
                >
                  {loggingOut ? "Signing out..." : "Switch User"}
                </button>
                <p className="text-xs text-[#939293] mt-2">
                  Switch to a different local user profile.
                </p>
              </div>
            </div>
          </section>

          {/* Editor Settings */}
          <section className="bg-[#403e41] rounded-xl border border-[#5b595c] p-6 mb-6">
            <h2 className="text-lg font-semibold text-[#fcfcfa] mb-4">Editor</h2>

            <div className="space-y-4">
              {/* Auto-save toggle */}
              <Toggle
                checked={settings.editor.autoSave}
                onChange={(checked) => updateEditor({ autoSave: checked })}
                label="Auto-save"
                description="Automatically save changes while editing notes"
              />

              {/* Auto-save delay */}
              {settings.editor.autoSave && (
                <div>
                  <label className="block text-[#fcfcfa] font-medium mb-2">
                    Auto-save delay
                  </label>
                  <select
                    value={settings.editor.autoSaveDelay}
                    onChange={(e) => updateEditor({ autoSaveDelay: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-[#2d2a2e] border border-[#5b595c] rounded-lg text-[#fcfcfa] focus:outline-none focus:border-[#ffd866]"
                  >
                    <option value={1000}>1 second</option>
                    <option value={2000}>2 seconds</option>
                    <option value={3000}>3 seconds</option>
                    <option value={5000}>5 seconds</option>
                  </select>
                  <p className="text-xs text-[#939293] mt-1">
                    How long to wait after you stop typing before saving
                  </p>
                </div>
              )}

              {/* Spell check toggle */}
              <div className="pt-2 border-t border-[#5b595c]">
                <Toggle
                  checked={settings.editor.spellCheck}
                  onChange={(checked) => updateEditor({ spellCheck: checked })}
                  label="Spell check"
                  description="Highlight spelling errors in the editor"
                />
              </div>

              {/* Font size */}
              <div className="pt-2 border-t border-[#5b595c]">
                <label className="block text-[#fcfcfa] font-medium mb-2">
                  Font size
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={12}
                    max={24}
                    value={settings.editor.fontSize}
                    onChange={(e) => updateEditor({ fontSize: Number(e.target.value) })}
                    className="flex-1 accent-[#ffd866]"
                  />
                  <span className="text-[#fcfcfa] w-12 text-right">{settings.editor.fontSize}px</span>
                </div>
              </div>

              {/* Reset to defaults */}
              <div className="pt-4 border-t border-[#5b595c]">
                <button
                  onClick={() => {
                    resetToDefaults();
                    toast.success("Settings reset to defaults");
                  }}
                  className="text-sm text-[#939293] hover:text-[#fcfcfa] transition-colors"
                >
                  Reset all settings to defaults
                </button>
              </div>
            </div>
          </section>

          {/* Text-to-Speech */}
          <section className="bg-[#403e41] rounded-xl border border-[#5b595c] p-6 mb-6">
            <h2 className="text-lg font-semibold text-[#fcfcfa] mb-4">Text-to-Speech</h2>
            <TtsSettings />
          </section>

          {/* Data Management */}
          <section className="bg-[#403e41] rounded-xl border border-[#5b595c] p-6 mb-6">
            <h2 className="text-lg font-semibold text-[#fcfcfa] mb-4">Data Management</h2>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <button
                    onClick={handleImportDeck}
                    className="w-full px-4 py-2.5 bg-[#5b595c] text-[#fcfcfa] rounded-lg hover:bg-[#5b595c]/80 font-medium transition-colors disabled:opacity-50"
                    disabled={importingDeck}
                  >
                    {importingDeck ? "Importing..." : "Import Deck"}
                  </button>
                  <p className="text-xs text-[#939293] mt-2">
                    Import a deck from JSON.
                  </p>
                </div>
                <div>
                  <button
                    onClick={handleImportQuiz}
                    className="w-full px-4 py-2.5 bg-[#5b595c] text-[#fcfcfa] rounded-lg hover:bg-[#5b595c]/80 font-medium transition-colors disabled:opacity-50"
                    disabled={importingQuiz}
                  >
                    {importingQuiz ? "Importing..." : "Import Quiz"}
                  </button>
                  <p className="text-xs text-[#939293] mt-2">
                    Import a quiz from JSON.
                  </p>
                </div>
              </div>

              <div className="pt-4 border-t border-[#5b595c]">
                <Link
                  to="/export"
                  className="inline-flex items-center px-4 py-2.5 bg-[#ab9df2]/20 text-[#ab9df2] rounded-lg hover:bg-[#ab9df2]/30 font-medium transition-colors"
                >
                  Go to Export
                  <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </Link>
                <p className="text-xs text-[#939293] mt-2">
                  Export individual or bulk decks and quizzes.
                </p>
              </div>
            </div>
          </section>

          {/* Danger Zone */}
          <section className="bg-[#403e41] rounded-xl border border-[#ff6188]/50 p-6 mb-6">
            <h2 className="text-lg font-semibold text-[#ff6188] mb-4">Danger Zone</h2>

            <div className="space-y-4">
              {!showDeleteConfirm ? (
                <div>
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="w-full px-4 py-2.5 border border-[#ff6188] text-[#ff6188] rounded-lg hover:bg-[#ff6188]/10 font-medium transition-colors"
                  >
                    Delete Account
                  </button>
                  <p className="text-xs text-[#939293] mt-2">
                    Permanently delete your account and all data including decks, quizzes, and stats.
                  </p>
                </div>
              ) : (
                <div className="p-4 bg-[#ff6188]/10 border border-[#ff6188]/30 rounded-lg">
                  <p className="text-[#ff6188] font-medium mb-2">
                    Are you sure you want to delete your account?
                  </p>
                  <p className="text-sm text-[#939293] mb-4">
                    This will permanently delete all your decks, cards, quizzes, questions, and stats.
                    This action cannot be undone.
                  </p>
                  <p className="text-sm text-[#939293] mb-2">
                    Type <span className="font-mono text-[#ff6188]">DELETE</span> to confirm:
                  </p>
                  <input
                    type="text"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder="Type DELETE"
                    className="w-full px-3 py-2 bg-[#2d2a2e] border border-[#5b595c] rounded-lg text-[#fcfcfa] placeholder-[#939293] focus:outline-none focus:border-[#ff6188] mb-3"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleDeleteAccount}
                      disabled={deleteConfirmText !== "DELETE" || deleting}
                      className="flex-1 px-4 py-2 bg-[#ff6188] text-[#2d2a2e] rounded-lg hover:bg-[#ff6188]/90 font-medium transition-colors disabled:opacity-50"
                    >
                      {deleting ? "Deleting..." : "Delete Account"}
                    </button>
                    <button
                      onClick={() => {
                        setShowDeleteConfirm(false);
                        setDeleteConfirmText("");
                      }}
                      className="flex-1 px-4 py-2 border border-[#5b595c] text-[#fcfcfa] rounded-lg hover:bg-[#5b595c]/30 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* About */}
          <section className="bg-[#403e41] rounded-xl border border-[#5b595c] p-6">
            <h2 className="text-lg font-semibold text-[#fcfcfa] mb-2">About Kioku Desktop</h2>
            <p className="text-[#939293] text-sm">Version 1.0.0</p>
            <p className="text-[#939293] text-sm mt-2">
              A local-first flashcard study app. All your data is stored on this device.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
