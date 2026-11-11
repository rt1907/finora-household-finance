import { useCallback, useEffect, useMemo, useState } from 'react';
import { isSupabaseConfigured } from '@/config/env';
import {
  AuthUserSession,
  deleteMyUserAccount,
  getCurrentAuthUser,
  signOutCurrentUser,
} from '@/features/auth/services/authService';
import {
  archiveCustomHouseholdCategory,
  fetchCurrentUserProfile,
  updateUserProfileDisplayName,
} from '@/features/settings/services/settingsService';
import {
  createCustomCategory,
  fetchActiveHouseholdContext,
  fetchHouseholdCategories,
  notifyTransactionSaved,
} from '@/features/transactions/services/transactionService';
import { ActiveHouseholdContext } from '@/features/transactions/types/transaction.types';
import { validateNewCategoryName } from '@/features/transactions/utils/validation';
import { CategoryRow, TransactionType } from '@/types/database';

export function useSettingsViewModel(onSignedOut: () => void) {
  const backendReady = isSupabaseConfigured();

  const [loading, setLoading] = useState<boolean>(backendReady);
  const [authUser, setAuthUser] = useState<AuthUserSession | null>(null);
  const [householdContext, setHouseholdContext] =
    useState<ActiveHouseholdContext | null>(null);
  const [displayName, setDisplayName] = useState<string>('');
  const [categories, setCategories] = useState<CategoryRow[]>([]);

  const [savingProfile, setSavingProfile] = useState<boolean>(false);
  const [signingOut, setSigningOut] = useState<boolean>(false);
  const [deletingAccount, setDeletingAccount] = useState<boolean>(false);
  const [archivingCategoryId, setArchivingCategoryId] = useState<string | null>(
    null
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Add Custom Category Modal state
  const [categoryModalVisible, setCategoryModalVisible] =
    useState<boolean>(false);
  const [newCategoryType, setNewCategoryType] =
    useState<TransactionType>('expense');
  const [newCategoryName, setNewCategoryName] = useState<string>('');
  const [newCategoryIcon, setNewCategoryIcon] = useState<string>('tag');
  const [creatingCategory, setCreatingCategory] = useState<boolean>(false);
  const [categoryModalError, setCategoryModalError] = useState<string | null>(
    null
  );

  const reloadSettings = useCallback(async () => {
    if (!backendReady) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const user = await getCurrentAuthUser();
      setAuthUser(user);

      if (!user) {
        setHouseholdContext(null);
        setCategories([]);
        return;
      }

      const [profile, ctx] = await Promise.all([
        fetchCurrentUserProfile(user.userId),
        fetchActiveHouseholdContext(),
      ]);

      setDisplayName(profile?.full_name ?? '');
      setHouseholdContext(ctx);

      if (ctx) {
        const cats = await fetchHouseholdCategories(ctx.household.id);
        setCategories(cats);
      } else {
        setCategories([]);
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Unable to load settings.'
      );
    } finally {
      setLoading(false);
    }
  }, [backendReady]);

  useEffect(() => {
    let isMounted = true;

    async function init() {
      if (!backendReady) {
        if (isMounted) setLoading(false);
        return;
      }

      try {
        const user = await getCurrentAuthUser();
        if (!isMounted) return;
        setAuthUser(user);

        if (!user) {
          setHouseholdContext(null);
          setCategories([]);
          return;
        }

        const [profile, ctx] = await Promise.all([
          fetchCurrentUserProfile(user.userId),
          fetchActiveHouseholdContext(),
        ]);

        if (!isMounted) return;
        setDisplayName(profile?.full_name ?? '');
        setHouseholdContext(ctx);

        if (ctx) {
          const cats = await fetchHouseholdCategories(ctx.household.id);
          if (isMounted) {
            setCategories(cats);
          }
        }
      } catch (err) {
        if (isMounted) {
          setErrorMessage(
            err instanceof Error ? err.message : 'Unable to load settings.'
          );
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void init();

    return () => {
      isMounted = false;
    };
  }, [backendReady]);

  const customCategories = useMemo(
    () => categories.filter((c) => !c.is_system),
    [categories]
  );

  const handleSaveProfileName = useCallback(async () => {
    if (!authUser) return;
    setErrorMessage(null);
    setSuccessMessage(null);

    const trimmed = displayName.trim();
    if (!trimmed) {
      setErrorMessage('Please enter a display name.');
      return;
    }

    setSavingProfile(true);
    try {
      const updated = await updateUserProfileDisplayName(
        authUser.userId,
        trimmed
      );
      setDisplayName(updated.full_name ?? trimmed);
      setSuccessMessage('Display name updated!');
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to update display name.'
      );
    } finally {
      setSavingProfile(false);
    }
  }, [authUser, displayName]);

  const openAddCategoryModal = useCallback((type: TransactionType) => {
    setNewCategoryType(type);
    setNewCategoryName('');
    setNewCategoryIcon('tag');
    setCategoryModalError(null);
    setCategoryModalVisible(true);
  }, []);

  const handleCreateCustomCategory = useCallback(async () => {
    setCategoryModalError(null);
    if (!householdContext) {
      setCategoryModalError(
        'Join or create a household to add custom categories.'
      );
      return;
    }

    const validation = validateNewCategoryName(
      newCategoryName,
      newCategoryType,
      categories
    );
    if (!validation.valid) {
      setCategoryModalError(validation.errorMessage);
      return;
    }

    setCreatingCategory(true);
    try {
      const created = await createCustomCategory({
        householdId: householdContext.household.id,
        name: validation.normalizedName,
        type: newCategoryType,
        icon: newCategoryIcon,
      });
      setCategories((prev) => [...prev, created]);
      setCategoryModalVisible(false);
      setSuccessMessage(`Added custom category "${created.name}".`);
    } catch (err) {
      setCategoryModalError(
        err instanceof Error ? err.message : 'Unable to create category.'
      );
    } finally {
      setCreatingCategory(false);
    }
  }, [
    categories,
    householdContext,
    newCategoryIcon,
    newCategoryName,
    newCategoryType,
  ]);

  const handleArchiveCategory = useCallback(async (category: CategoryRow) => {
    setArchivingCategoryId(category.id);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await archiveCustomHouseholdCategory(category.id);
      setCategories((prev) => prev.filter((item) => item.id !== category.id));
      setSuccessMessage(`Archived category "${category.name}".`);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Unable to archive category.'
      );
    } finally {
      setArchivingCategoryId(null);
    }
  }, []);

  const handleSignOut = useCallback(async () => {
    setSigningOut(true);
    setErrorMessage(null);

    try {
      await signOutCurrentUser();
      notifyTransactionSaved();
      onSignedOut();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to sign out.'
      );
    } finally {
      setSigningOut(false);
    }
  }, [onSignedOut]);

  const handleDeleteAccount = useCallback(async () => {
    setDeletingAccount(true);
    setErrorMessage(null);

    try {
      await deleteMyUserAccount();
      notifyTransactionSaved();
      onSignedOut();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to delete account.'
      );
    } finally {
      setDeletingAccount(false);
    }
  }, [onSignedOut]);

  return {
    loading,
    authUser,
    householdContext,
    displayName,
    setDisplayName,
    customCategories,
    savingProfile,
    signingOut,
    deletingAccount,
    archivingCategoryId,
    errorMessage,
    successMessage,
    handleSaveProfileName,
    handleArchiveCategory,
    handleSignOut,
    handleDeleteAccount,
    reloadSettings,

    // Custom Category Modal
    categoryModalVisible,
    setCategoryModalVisible,
    newCategoryType,
    newCategoryName,
    setNewCategoryName,
    newCategoryIcon,
    setNewCategoryIcon,
    creatingCategory,
    categoryModalError,
    openAddCategoryModal,
    handleCreateCustomCategory,
  };
}
