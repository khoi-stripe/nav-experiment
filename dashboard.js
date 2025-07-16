// Dashboard functionality with account-specific sandbox management
class Dashboard {
    constructor() {
        // Initialize properties
        this.currentOpenPanel = null;
        this.previousNavPanelState = null;
        this.currentActiveAccount = null;
        
        // Cache frequently accessed DOM elements
        this._domCache = {};
        this._initDOMCache();
        
        // Debounce timers
        this._debounceTimers = {};
        
        // Data initialization
        this.accountSandboxes = this.loadAccountSandboxes();
        this.organizationSandboxes = this.loadOrganizationSandboxes();
        this.organizationAccounts = this.getOrganizationAccounts();
        
        // Performance optimization: reduce logging in production
        this.debugMode = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        
        // Clean up any broken organization sandboxes on startup
        this.cleanupBrokenOrganizationSandboxes();
        
        this.init();
    }

    // Cache DOM elements to avoid repeated queries
    _initDOMCache() {
        // Initialize cache, but allow for elements that might not exist yet
        this._domCache.container = document.getElementById('sandbox-list');
        this._domCache.popoverContent = document.getElementById('sandbox-popover-content');
        this._domCache.activeAccount = document.getElementById('active-account');
        this._domCache.accountSwitcherText = document.getElementById('accountSwitcherText');
        
        // Log cache status in debug mode
        this._log('log', 'DOM Cache initialized:', {
            container: !!this._domCache.container,
            popoverContent: !!this._domCache.popoverContent,
            activeAccount: !!this._domCache.activeAccount,
            accountSwitcherText: !!this._domCache.accountSwitcherText
        });
    }

    // Helper method to refresh DOM cache if needed
    _refreshDOMCache() {
        if (!this._domCache.container) {
            this._domCache.container = document.getElementById('sandbox-list');
        }
        if (!this._domCache.popoverContent) {
            this._domCache.popoverContent = document.getElementById('sandbox-popover-content');
        }
        if (!this._domCache.activeAccount) {
            this._domCache.activeAccount = document.getElementById('active-account');
        }
        if (!this._domCache.accountSwitcherText) {
            this._domCache.accountSwitcherText = document.getElementById('accountSwitcherText');
        }
    }

    // Optimized logging - only log in debug mode
    _log(level, ...args) {
        if (this.debugMode) {
            console[level](...args);
        }
    }

    // Debounce utility for expensive operations
    _debounce(key, func, delay = 100) {
        if (this._debounceTimers[key]) {
            clearTimeout(this._debounceTimers[key]);
        }
        this._debounceTimers[key] = setTimeout(() => {
            func();
            delete this._debounceTimers[key];
        }, delay);
    }

    init() {
        // Get panels on demand
        const panels = document.querySelectorAll('.nav-panel');
        
        // Add event listeners for panel toggles
        panels.forEach(panel => {
            const toggle = panel.querySelector('.panel-toggle');
            if (toggle) {
                toggle.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.togglePanel(panel.id);
                });
            }
        });

        // Add keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeAllPanels();
            }
        });

        // Close panels when clicking outside (disabled for dashboard.html compatibility)
        // document.addEventListener('click', (e) => {
        //     if (!e.target.closest('.nav-panel')) {
        //         this.closeAllPanels();
        //     }
        // });

        // Initialize account tracking
        this.initializeAccountTracking();
        
        // Force immediate sandbox update after initialization
        if (this.currentActiveAccount) {
            // Use setTimeout to ensure DOM is ready
            setTimeout(() => {
                this.forceUpdateSandboxes(this.currentActiveAccount);
            }, 100);
        }
        
        // Initialize account visibility functionality
        this.initAccountVisibility();
        
        // Initialize create account modal functionality
        this.initCreateAccountModal();
        
        // Expose debugging functions globally
        window.debugSandboxes = () => this.debugSandboxStorage();
        window.clearSandboxes = () => this.clearAllSandboxData();
    }

    // Clean up timers and resources
    cleanup() {
        // Clear all debounce timers
        Object.values(this._debounceTimers).forEach(timer => clearTimeout(timer));
        this._debounceTimers = {};
    }

    // Get organization accounts mapping
    getOrganizationAccounts() {
        return {
            'acme-inc': [
                { name: 'Acme Eats US', initials: 'AE', color: 'color-1' },
                { name: 'Acme Eats UK', initials: 'AE', color: 'color-2' },
                { name: 'Acme Deliveries US', initials: 'AD', color: 'color-3' },
                { name: 'Acme Deliveries Canada', initials: 'AD', color: 'color-4' },
                { name: 'Acme Rides US', initials: 'AR', color: 'color-5' },
                { name: 'Acme Rides Europe', initials: 'AR', color: 'color-6' },
                { name: 'Acme Financial Services', initials: 'AF', color: 'color-1' },
                { name: 'Acme Technology Division', initials: 'AT', color: 'color-2' }
            ],
            'lil-fatsos': [
                { name: 'Lil\'Fatsos Downtown', initials: 'LD', color: 'color-1' },
                { name: 'Lil\'Fatsos Midtown', initials: 'LM', color: 'color-2' },
                { name: 'Lil\'Fatsos Westside', initials: 'LW', color: 'color-3' },
                { name: 'Lil\'Fatsos Airport', initials: 'LA', color: 'color-4' }
            ]
        };
    }

    // Initialize account tracking and sandbox management
    initializeAccountTracking() {
        const activeAccount = this._domCache.activeAccount;
        if (activeAccount) {
            this.currentActiveAccount = activeAccount.dataset.accountName;
            this.updateSandboxesForAccount(this.currentActiveAccount);
        }

        // Watch for account changes
        const accountObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'data-account-name') {
                    const newAccount = mutation.target.dataset.accountName;
                    if (newAccount !== this.currentActiveAccount) {
                        const previousAccount = this.currentActiveAccount;
                        this.currentActiveAccount = newAccount;
                        this._log('log', 'Account switched from:', previousAccount, 'to:', newAccount);
                        
                        // Validate sandbox isolation
                        this.validateSandboxIsolation(previousAccount, newAccount);
                        
                        this.updateSandboxesForAccount(newAccount);
                    }
                }
            });
        });

        if (activeAccount) {
            accountObserver.observe(activeAccount, {
                attributes: true,
                attributeFilter: ['data-account-name']
            });
        }
    }

    // Optimized storage methods with batching
    saveAccountSandboxes() {
        this._debounce('saveAccount', () => {
            try {
                localStorage.setItem('accountSandboxes', JSON.stringify(this.accountSandboxes));
            } catch (e) {
                this._log('error', 'Failed to save account sandboxes to localStorage:', e);
            }
        }, 200);
    }

    saveOrganizationSandboxes() {
        this._debounce('saveOrg', () => {
            try {
                localStorage.setItem('organizationSandboxes', JSON.stringify(this.organizationSandboxes));
            } catch (e) {
                this._log('error', 'Failed to save organization sandboxes to localStorage:', e);
            }
        }, 200);
    }

    // Optimized loading with error handling
    loadAccountSandboxes() {
        try {
            const saved = localStorage.getItem('accountSandboxes');
            return saved ? JSON.parse(saved) : {};
        } catch (e) {
            this._log('error', 'Failed to load account sandboxes from localStorage:', e);
            return {};
        }
    }

    loadOrganizationSandboxes() {
        try {
            const saved = localStorage.getItem('organizationSandboxes');
            return saved ? JSON.parse(saved) : {};
        } catch (e) {
            this._log('error', 'Failed to load organization sandboxes from localStorage:', e);
            return {};
        }
    }

    // Debug function to inspect sandbox storage
    debugSandboxStorage() {
        this._log('log', '=== SANDBOX STORAGE DEBUG ===');
        this._log('log', 'Current Active Account:', this.currentActiveAccount);
        this._log('log', 'Account Sandboxes:', JSON.stringify(this.accountSandboxes, null, 2));
        this._log('log', 'Organization Sandboxes:', JSON.stringify(this.organizationSandboxes, null, 2));
        this._log('log', 'LocalStorage accountSandboxes:', localStorage.getItem('accountSandboxes'));
        this._log('log', 'LocalStorage organizationSandboxes:', localStorage.getItem('organizationSandboxes'));
        this._log('log', '=== END DEBUG ===');
    }

    // Clear all sandbox data (for debugging)
    clearAllSandboxData() {
        this.accountSandboxes = {};
        this.organizationSandboxes = {};
        localStorage.removeItem('accountSandboxes');
        localStorage.removeItem('organizationSandboxes');
        this._log('log', 'All sandbox data cleared');
        this.updateSandboxesForAccount(this.currentActiveAccount);
    }

    // Clean up broken organization sandboxes with undefined organizationId
    cleanupBrokenOrganizationSandboxes() {
        this._log('log', '🧹 Cleaning up broken organization sandboxes...');
        
        let cleanupCount = 0;
        const brokenKeys = [];
        
        // Find sandboxes with undefined or invalid organizationId
        Object.keys(this.organizationSandboxes).forEach(orgId => {
            if (!orgId || orgId === 'undefined' || orgId === 'null') {
                brokenKeys.push(orgId);
                const brokenSandboxes = this.organizationSandboxes[orgId];
                this._log('warn', `🗑️  Found ${brokenSandboxes.length} broken sandboxes with invalid orgId: "${orgId}"`);
                cleanupCount += brokenSandboxes.length;
            }
        });
        
        // Remove broken entries
        brokenKeys.forEach(brokenKey => {
            delete this.organizationSandboxes[brokenKey];
        });
        
        if (cleanupCount > 0) {
            this.saveOrganizationSandboxes();
            this._log('log', `✅ Cleaned up ${cleanupCount} broken organization sandboxes`);
            this.updateSandboxesForAccount(this.currentActiveAccount);
        } else {
            this._log('log', '✅ No broken organization sandboxes found');
        }
        
        return cleanupCount;
    }

    // Optimized validation with reduced logging
    validateSandboxIsolation(previousAccount, newAccount) {
        if (!previousAccount || !newAccount || !this.debugMode) return;
        
        const previousSandboxes = this.accountSandboxes[previousAccount] || [];
        const newSandboxes = this.accountSandboxes[newAccount] || [];
        
        this._log('log', '=== SANDBOX ISOLATION VALIDATION ===');
        this._log('log', `Previous: ${previousAccount} (${previousSandboxes.length}), New: ${newAccount} (${newSandboxes.length})`);
        
        // Quick validation checks
        const isolationBroken = previousSandboxes === newSandboxes;
        const invalidPrevious = previousSandboxes.filter(s => s.account && s.account !== previousAccount);
        const invalidNew = newSandboxes.filter(s => s.account && s.account !== newAccount);
        
        if (isolationBroken) {
            this._log('error', '🚨 SANDBOX ISOLATION BROKEN: Same array reference!');
        } else if (invalidPrevious.length || invalidNew.length) {
            this._log('error', '🚨 BUSINESS ACCOUNT ISOLATION BROKEN');
        } else {
            this._log('log', '✅ Sandbox isolation working correctly');
        }
        
        this._log('log', '=== END VALIDATION ===');
    }

    // Get sandboxes for a specific account
    getSandboxesForAccount(accountName) {
        if (!accountName) {
            this._log('error', '🚨 getSandboxesForAccount called with empty accountName');
            return [];
        }
        
        this._log('log', `🔍 Getting sandboxes for account: "${accountName}"`);
        
        if (!this.accountSandboxes[accountName]) {
            this._log('log', `📦 No existing sandboxes found for "${accountName}", creating defaults...`);
            // Initialize with default sandboxes for new accounts
            this.accountSandboxes[accountName] = this.getDefaultSandboxes(accountName);
            this.saveAccountSandboxes();
            this._log('log', `✅ Created ${this.accountSandboxes[accountName].length} default sandboxes for "${accountName}"`);
        }
        
        const sandboxes = this.accountSandboxes[accountName];
        this._log('log', `📦 Returning ${sandboxes.length} sandboxes for "${accountName}":`, sandboxes.map(s => s.name));
        return sandboxes;
    }

    // Get organization sandboxes for a specific organization
    getOrganizationSandboxesForOrganization(organizationId) {
        if (!organizationId || organizationId === 'undefined' || organizationId === 'null') {
            this._log('error', '🚨 getOrganizationSandboxesForOrganization called with invalid organizationId:', organizationId);
            return []; // Return empty array for invalid org IDs
        }
        
        this._log('log', `🔍 Getting organization sandboxes for organization: "${organizationId}"`);
        
        if (!this.organizationSandboxes[organizationId]) {
            this._log('log', `📦 No existing organization sandboxes found for "${organizationId}", creating defaults...`);
            // Initialize with default organization sandboxes
            this.organizationSandboxes[organizationId] = this.getDefaultOrganizationSandboxes(organizationId);
            this.saveOrganizationSandboxes();
            this._log('log', `✅ Created organization sandboxes for "${organizationId}"`);
        }
        
        const sandboxes = this.organizationSandboxes[organizationId];
        this._log('log', `📦 Returning ${sandboxes.length} organization sandboxes for "${organizationId}"`);
        return sandboxes;
    }

    // Optimized default sandbox creation with reduced redundancy
    getDefaultSandboxes(accountName) {
        if (!accountName) return [];
        
        const timestamp = new Date().getTime();
        const accountSlug = this.createAccountSlug(accountName);
        
        const templates = [
            { name: 'Development Environment', desc: 'Development and testing environment' },
            { name: 'Staging Environment', desc: 'Pre-production staging environment' },
            { name: 'QA Testing', desc: 'Quality assurance and testing environment' }
        ];
        
        return templates.map((template, index) => ({
            name: `${accountName} ${template.name}`,
            account: accountName,
            type: 'account',
            created: new Date().toISOString(),
            lastUsed: null,
            id: `${accountSlug}-${template.name.toLowerCase().replace(/\s+/g, '-')}-${timestamp + index}`,
            description: `${template.desc} for ${accountName}`
        }));
    }

    // Helper method to create clean account slug for IDs
    createAccountSlug(accountName) {
        if (!accountName) {
            this._log('error', '🚨 Cannot create slug from empty account name');
            return 'unknown-account';
        }
        
        const slug = accountName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with hyphens
            .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
            .substring(0, 20); // Limit length
            
        this._log('log', `🔧 Created slug for "${accountName}": "${slug}"`);
        return slug || 'account'; // Fallback if slug becomes empty
    }

    // Optimized organization sandbox creation
    getDefaultOrganizationSandboxes(organizationId) {
        if (!organizationId || organizationId === 'undefined') {
            this._log('error', '🚨 Cannot create organization sandboxes without valid organizationId:', organizationId);
            return [];
        }
        
        const orgAccounts = this.organizationAccounts[organizationId] || [];
        const timestamp = new Date().getTime();
        const orgName = this.getOrganizationDisplayName(organizationId);
        const orgSlug = this.createOrganizationSlug(organizationId, orgName);
        const accountCount = orgAccounts.length;
        
        const templates = [
            { name: 'Multi-Account Development', desc: `Development environment for ${orgName} organization (${accountCount} accounts)` },
            { name: 'Cross-Account Integration', desc: `Integration testing across all ${orgName} accounts` },
            { name: 'Production Rollout', desc: `Production rollout coordination for ${orgName}` },
            { name: 'Security & Compliance', desc: `Security and compliance testing for ${orgName}` }
        ];
        
        return templates.map((template, index) => ({
            name: `${orgName} ${template.name}`,
            type: 'organization',
            organizationId: organizationId,
            accounts: orgAccounts.map(acc => ({ ...acc })),
            created: new Date().toISOString(),
            lastUsed: null,
            id: `${orgSlug}-${template.name.toLowerCase().replace(/\s+/g, '-')}-${timestamp + index}`,
            description: template.desc
        }));
    }

    // Helper method to create clean organization slug for IDs
    createOrganizationSlug(organizationId, orgName) {
        // Prefer organization ID if it's clean, otherwise use name
        if (organizationId && organizationId.match(/^[a-z0-9-]+$/)) {
            return organizationId.substring(0, 15);
        }
        
        return orgName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with hyphens
            .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
            .substring(0, 15); // Shorter limit for org slugs
    }

    // Helper method to get display name for organization
    getOrganizationDisplayName(organizationId) {
        // Try to find the organization name from current accounts
        const activeAccountElement = this._domCache.activeAccount;
        if (activeAccountElement && activeAccountElement.dataset.organization === organizationId) {
            return activeAccountElement.dataset.accountName;
        }
        
        // Fallback to organization ID with formatting
        return organizationId.split('-').map(word => 
            word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
    }

    // Get organization name from ID
    getOrganizationName(organizationId) {
        const orgMapping = {
            'acme-inc': 'Acme Inc',
            'lil-fatsos': 'Lil\'Fatsos'
        };
        return orgMapping[organizationId] || organizationId;
    }

    // Update sandboxes display for current account (optimized with debouncing)
    updateSandboxesForAccount(accountName) {
        // If no account name provided, try to get it from DOM
        if (!accountName) {
            const activeElement = this._domCache.activeAccount || document.getElementById('active-account');
            accountName = activeElement?.dataset.accountName || this.currentActiveAccount;
        }
        
        if (!accountName) {
            this._log('warn', 'No account name available for sandbox update');
            return;
        }
        
        // Reduce debounce delay and ensure immediate execution when needed
        if (this._debounceTimers['updateSandboxes']) {
            // If there's already a pending update, execute immediately
            clearTimeout(this._debounceTimers['updateSandboxes']);
            delete this._debounceTimers['updateSandboxes'];
            this._updateSandboxesImmediate(accountName);
        } else {
            this._debounce('updateSandboxes', () => {
                this._updateSandboxesImmediate(accountName);
            }, 10);
        }
    }

    // Force immediate sandbox update (bypasses debouncing)
    forceUpdateSandboxes(accountName) {
        this._updateSandboxesImmediate(accountName);
    }

    // Immediate sandbox update (internal method)
    _updateSandboxesImmediate(accountName) {
        this._log('log', '🔄 updateSandboxesForAccount called with accountName:', accountName);
        this._log('log', '🔄 Current this.currentActiveAccount:', this.currentActiveAccount);
        
        // Refresh DOM cache to ensure we have latest elements
        this._refreshDOMCache();
        
        const container = this._domCache.container;
        const popoverContent = this._domCache.popoverContent;
        
        // Fallback to direct DOM queries if cache failed
        const containerElement = container || document.getElementById('sandbox-list');
        const popoverContentElement = popoverContent || document.getElementById('sandbox-popover-content');
        
        // Batch DOM operations by using document fragment
        let containerFragment = null;
        let popoverFragment = null;
        
        if (containerElement) {
            containerElement.innerHTML = '';
            containerFragment = document.createDocumentFragment();
        }
        
        if (popoverContentElement) {
            // Clear existing sandbox items from popover efficiently
            const existingItems = popoverContentElement.querySelectorAll('.sandbox-popover-item');
            const itemsToRemove = Array.from(existingItems).filter(item => item.querySelector('.accountAvatar'));
            itemsToRemove.forEach(item => item.remove());
            
            popoverFragment = document.createDocumentFragment();
        }

        // Check if current account belongs to an organization (cached values)
        const activeAccountElement = this._domCache.activeAccount || document.getElementById('active-account');
        const organizationId = activeAccountElement?.dataset.organization;
        const actualActiveAccountName = activeAccountElement?.dataset.accountName;
        
        this._log('log', '🔄 Active account element data:', {
            accountName: actualActiveAccountName,
            organizationId: organizationId
        });
        
        // Validate account name consistency
        if (accountName !== actualActiveAccountName) {
            this._log('warn', '⚠️  Account name mismatch! Parameter:', accountName, 'vs DOM:', actualActiveAccountName);
        }
        
        // Determine which sandboxes to show (simplified logic)
        const sandboxesToShow = this._determineSandboxesToShow(accountName, organizationId);
        
        // Log the final sandboxes being shown for debugging
        this._log('log', '📦 Final sandboxesToShow:', sandboxesToShow.length, 'sandboxes');
        this._log('log', '📦 Sandbox names:', sandboxesToShow.map(s => s.name));
        
        // Batch create sandbox items
        if (containerFragment && containerElement) {
            sandboxesToShow.forEach((sandbox, index) => {
                const sandboxItem = this.createSandboxItem(sandbox, index);
                containerFragment.appendChild(sandboxItem);
            });
            
            // Single DOM append
            containerElement.appendChild(containerFragment);
            
            // Update animation delays
            this.updateAnimationDelays(containerElement);
        }
        
        // Batch create popover items
        if (popoverFragment && popoverContentElement) {
            sandboxesToShow.forEach((sandbox, index) => {
                const sandboxPopoverItem = this.createSandboxPopoverItem(sandbox, index);
                popoverFragment.appendChild(sandboxPopoverItem);
            });
            
            // Insert before the divider container (if it exists)
            const dividerContainer = popoverContentElement.querySelector('.sandbox-popover-divider-container');
            if (dividerContainer) {
                popoverContentElement.insertBefore(popoverFragment, dividerContainer);
            } else {
                popoverContentElement.appendChild(popoverFragment);
            }
            
            // Update animation delays for popover
            this.updatePopoverAnimationDelays(popoverContentElement);
        }
        
        // Determine context for logging
        const logContext = this._getSandboxContext(organizationId);
        this._log('log', `Updated sandbox list - Context: ${logContext}, Sandboxes:`, sandboxesToShow);
    }

    // Helper method to determine which sandboxes to show (extracted for clarity)
    _determineSandboxesToShow(accountName, organizationId) {
        // Check if we're in sandbox mode
        const isInSandboxMode = typeof window !== 'undefined' && window.isInSandboxMode;
        const originalBusinessAccountName = typeof window !== 'undefined' ? window.originalBusinessAccountName : null;
        const originalBusinessAccountOrganization = typeof window !== 'undefined' ? window.originalBusinessAccountOrganization : null;
        
        this._log('log', '🔄 Sandbox mode status:', {
            isInSandboxMode,
            originalBusinessAccountName,
            originalBusinessAccountOrganization
        });
        
        if (isInSandboxMode && originalBusinessAccountName) {
            // In sandbox mode - always use the original business account to determine available sandboxes
            if (originalBusinessAccountOrganization) {
                this._log('log', '📦 SANDBOX MODE: Showing organization sandboxes for original business account organization:', originalBusinessAccountOrganization);
                return this.getOrganizationSandboxesForOrganization(originalBusinessAccountOrganization);
            } else {
                this._log('log', '📦 SANDBOX MODE: Showing account sandboxes for original business account:', originalBusinessAccountName);
                return this.getSandboxesForAccount(originalBusinessAccountName);
            }
        } else {
            // Not in sandbox mode - use CURRENT business account to determine sandboxes
            this._log('log', '📦 NORMAL MODE: Using current business account for sandbox isolation');
            this._log('log', '📦 Organization ID check:', organizationId, 'Type:', typeof organizationId);
            
            if (organizationId && organizationId !== 'undefined' && organizationId !== 'null') {
                // Business account is part of a VALID organization
                const accountSwitcherText = this._domCache.accountSwitcherText;
                const isViewingAllAccounts = accountSwitcherText?.textContent === 'All accounts';
                
                this._log('log', '📦 Valid organization detected:', organizationId);
                this._log('log', '📦 Account switcher text:', accountSwitcherText?.textContent);
                this._log('log', '📦 Is viewing all accounts:', isViewingAllAccounts);
                
                if (isViewingAllAccounts) {
                    this._log('log', '📦 Showing organization sandboxes for business account organization:', organizationId);
                    return this.getOrganizationSandboxesForOrganization(organizationId);
                } else if (accountSwitcherText) {
                    const specificAccountName = accountSwitcherText.textContent.replace(' (sandbox)', '');
                    this._log('log', '📦 Showing account sandboxes for selected sub-account:', specificAccountName);
                    return this.getSandboxesForAccount(specificAccountName);
                } else {
                    this._log('log', '📦 Showing account sandboxes for business account (fallback):', accountName);
                    return this.getSandboxesForAccount(accountName);
                }
            } else {
                // Business account is standalone - always show its account sandboxes
                this._log('log', '📦 STANDALONE ACCOUNT: No valid organization ID, treating as standalone');
                this._log('log', '📦 CRITICAL: Showing account sandboxes for standalone business account:', accountName);
                return this.getSandboxesForAccount(accountName);
            }
        }
    }

    // Helper method to get sandbox context for logging
    _getSandboxContext(organizationId) {
        const isInSandboxMode = typeof window !== 'undefined' && window.isInSandboxMode;
        return isInSandboxMode ? 'Sandbox Mode' : (organizationId ? 'Organization' : 'Account');
    }

    // Create a sandbox item element for the main list
    createSandboxItem(sandbox, index) {
        const item = document.createElement('div');
        item.className = `sandbox-item ${sandbox.type}`;
        item.style.animationDelay = `${index * 0.1}s`;

        // Get the parent business account color for this sandbox
        const businessAccountColor = this.getSandboxColor(sandbox);
        const colorHexMap = {
            'color-1': '#8B5CF6', // purple
            'color-2': '#EF4444', // red
            'color-3': '#10B981', // green
            'color-4': '#F59E0B', // amber
            'color-5': '#3B82F6', // blue
            'color-6': '#EC4899'  // pink
        };
        const hexColor = colorHexMap[businessAccountColor] || '#8B5CF6';

        // Different display for organization vs account sandboxes
        if (sandbox.type === 'organization') {
            const accountCount = sandbox.accounts ? sandbox.accounts.length : 0;
            item.innerHTML = `
                <div class="sandbox-header">
                    <div class="sandbox-icon organization-icon" style="background-color: ${hexColor}20; border: 1px solid ${hexColor}40;">
                        <svg viewBox="0 0 16 16" width="16" height="16">
                            <path fill-rule="evenodd" clip-rule="evenodd" d="M0 2.75C0 1.23122 1.23122 0 2.75 0H8C9.51878 0 10.75 1.23122 10.75 2.75V3C10.75 3.41421 10.4142 3.75 10 3.75C9.58579 3.75 9.25 3.41421 9.25 3V2.75C9.25 2.05964 8.69036 1.5 8 1.5H2.75C2.05964 1.5 1.5 2.05964 1.5 2.75V14.25C1.5 14.3881 1.61193 14.5 1.75 14.5H4.25C4.66421 14.5 5 14.8358 5 15.25C5 15.6642 4.66421 16 4.25 16H1.75C0.783502 16 0 15.2165 0 14.25V2.75ZM10.8525 5.864C11.0957 5.712 11.4043 5.712 11.6475 5.864L15.6475 8.364C15.8668 8.50105 16 8.74141 16 9V14.25C16 15.2165 15.2165 16 14.25 16H8.25C7.2835 16 6.5 15.2165 6.5 14.25V9C6.5 8.74141 6.63321 8.50105 6.8525 8.364L10.8525 5.864ZM8 9.41569V14.25C8 14.3881 8.11193 14.5 8.25 14.5H10.5V13C10.5 12.5858 10.8358 12.25 11.25 12.25C11.6642 12.25 12 12.5858 12 13V14.5H14.25C14.3881 14.5 14.5 14.3881 14.5 14.25V9.41569L11.25 7.38444L8 9.41569Z" fill="${hexColor}"/>
                            <path d="M3 4.5C3 3.94772 3.44772 3.5 4 3.5C4.55228 3.5 5 3.94772 5 4.5C5 5.05228 4.55228 5.5 4 5.5C3.44772 5.5 3 5.05228 3 4.5Z" fill="${hexColor}"/>
                            <path d="M3 8C3 7.44772 3.44772 7 4 7C4.55228 7 5 7.44772 5 8C5 8.55228 4.55228 9 4 9C3.44772 9 3 8.55228 3 8Z" fill="${hexColor}"/>
                            <path d="M6 4.5C6 3.94772 6.44772 3.5 7 3.5C7.55228 3.5 8 3.94772 8 4.5C8 5.05228 7.55228 5.5 7 5.5C6.44772 5.5 6 5.05228 6 4.5Z" fill="${hexColor}"/>
                            <path d="M3 11.5C3 10.9477 3.44772 10.5 4 10.5C4.55228 10.5 5 10.9477 5 11.5C5 12.0523 4.55228 12.5 4 12.5C3.44772 12.5 3 12.0523 3 11.5Z" fill="${hexColor}"/>
                        </svg>
                    </div>
                    <div class="sandbox-info">
                        <div class="sandbox-name">${sandbox.name}</div>
                        <div class="sandbox-meta">Organization • ${accountCount} accounts</div>
                    </div>
                </div>
                <div class="sandbox-accounts">
                    ${sandbox.accounts.slice(0, 3).map(acc => `
                        <div class="mini-account-avatar ${acc.color}" title="${acc.name}">${acc.initials}</div>
                    `).join('')}
                    ${accountCount > 3 ? `<div class="account-count">+${accountCount - 3}</div>` : ''}
                </div>
                <div class="sandbox-actions">
                    <button class="enter-sandbox-btn" onclick="dashboard.enterSandboxMode(${JSON.stringify(sandbox).replace(/"/g, '&quot;')})">
                        Enter
                    </button>
                    <button class="delete-sandbox-btn" onclick="dashboard.deleteOrganizationSandbox('${sandbox.name}', '${sandbox.organizationId}')">
                        Delete
                    </button>
                </div>
            `;
        } else {
            item.innerHTML = `
                <div class="sandbox-header">
                    <div class="sandbox-icon account-icon" style="background-color: ${hexColor}20; border: 1px solid ${hexColor}40;">
                        <svg viewBox="0 0 24 24" width="16" height="16">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" fill="none" stroke="${hexColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            <circle cx="12" cy="7" r="4" fill="none" stroke="${hexColor}" stroke-width="2"/>
                        </svg>
                    </div>
                    <div class="sandbox-info">
                        <div class="sandbox-name">${sandbox.name}</div>
                        <div class="sandbox-meta">Account sandbox</div>
                    </div>
                </div>
                <div class="sandbox-actions">
                    <button class="enter-sandbox-btn" onclick="dashboard.enterSandboxMode(${JSON.stringify(sandbox).replace(/"/g, '&quot;')})">
                        Enter
                    </button>
                    <button class="delete-sandbox-btn" onclick="dashboard.deleteSandbox('${sandbox.name}')">
                        Delete
                    </button>
                </div>
            `;
        }

        return item;
    }

    // Get the color of a business account by name
    getBusinessAccountColor(accountName) {
        // Check if this is the current active account
        const activeAccountElement = this._domCache.activeAccount;
        if (activeAccountElement && activeAccountElement.dataset.accountName === accountName) {
            return activeAccountElement.dataset.accountColor;
        }
        
        // Check other business accounts in the nav panel
        const businessAccounts = document.querySelectorAll('.nav-component.business-account');
        for (const account of businessAccounts) {
            if (account.dataset.accountName === accountName) {
                return account.dataset.accountColor;
            }
        }
        
        // Fallback to a default color
        return 'color-1';
    }
    
    // Get the main business account color for an organization
    getOrganizationBusinessAccountColor(organizationId) {
        // Find the business account that belongs to this organization
        const businessAccounts = document.querySelectorAll('.nav-component.business-account.organization');
        for (const account of businessAccounts) {
            if (account.dataset.organization === organizationId) {
                return account.dataset.accountColor;
            }
        }
        
        // Also check if the active account belongs to this organization
        const activeAccountElement = this._domCache.activeAccount;
        if (activeAccountElement && activeAccountElement.dataset.organization === organizationId) {
            return activeAccountElement.dataset.accountColor;
        }
        
        // Fallback to a default color
        return 'color-1';
    }
    
    // Get the appropriate color for a sandbox based on its parent business account
    getSandboxColor(sandbox) {
        if (sandbox.type === 'organization') {
            // For organization sandboxes, use the main business account color for that organization
            return this.getOrganizationBusinessAccountColor(sandbox.organizationId);
        } else {
            // For account sandboxes, use the color of the account they belong to
            return this.getBusinessAccountColor(sandbox.account);
        }
    }

    // Create a sandbox item element for the popover
    createSandboxPopoverItem(sandbox, index) {
        const sandboxItem = document.createElement('div');
        sandboxItem.className = 'sandbox-popover-item';
        sandboxItem.setAttribute('data-sandbox-type', sandbox.type);
        sandboxItem.setAttribute('data-organization', sandbox.organizationId || '');
        sandboxItem.setAttribute('data-account', sandbox.account || '');
        
        // Generate initials from sandbox name
        const initials = sandbox.name.split(' ').map(word => word[0]).join('').substring(0, 2).toUpperCase();
        
        // Use parent business account color instead of generic colors
        const colorClass = this.getSandboxColor(sandbox);
        
        sandboxItem.innerHTML = `
            <div class="icon">
                <div class="accountAvatar ${colorClass}">${initials}</div>
            </div>
            <span>${sandbox.name}</span>
        `;

        // Add click handler for sandbox selection
        sandboxItem.addEventListener('click', () => {
            this.enterSandboxMode(sandbox);
        });

        return sandboxItem;
    }

    // Update animation delays for items
    updateAnimationDelays(container) {
        const items = container.querySelectorAll('.sandbox-item');
        items.forEach((item, index) => {
            item.style.animationDelay = `${index * 0.1}s`;
        });
    }

    // Update animation delays for popover items
    updatePopoverAnimationDelays(container) {
        const items = container.querySelectorAll('.sandbox-popover-item');
        items.forEach((item, index) => {
            item.style.animationDelay = `${(index + 1) * 0.05}s`;
        });
    }

    // Enter sandbox mode
    enterSandboxMode(sandbox) {
        this._log('log', 'Entering sandbox mode:', sandbox.name, 'Type:', sandbox.type);
        
        // Update last used timestamp
        sandbox.lastUsed = new Date().toISOString();
        
        if (sandbox.type === 'organization') {
            // Update organization sandboxes
            const orgSandboxes = this.getOrganizationSandboxesForOrganization(sandbox.organizationId);
            const sandboxIndex = orgSandboxes.findIndex(s => s.name === sandbox.name);
            if (sandboxIndex !== -1) {
                orgSandboxes[sandboxIndex] = sandbox;
                this.organizationSandboxes[sandbox.organizationId] = orgSandboxes;
                this.saveOrganizationSandboxes();
            }
        } else {
            // Update account sandboxes
            const accountSandboxes = this.getSandboxesForAccount(sandbox.account);
            const sandboxIndex = accountSandboxes.findIndex(s => s.name === sandbox.name);
            if (sandboxIndex !== -1) {
                accountSandboxes[sandboxIndex] = sandbox;
                this.accountSandboxes[sandbox.account] = accountSandboxes;
                this.saveAccountSandboxes();
            }
        }

        // Close sandbox popover if it's open
        if (typeof window.hideSandboxPopover === 'function') {
            window.hideSandboxPopover();
        }

        // Call the global enterSandboxMode function if it exists
        if (typeof window.enterSandboxMode === 'function') {
            window.enterSandboxMode(sandbox.name, sandbox.type, sandbox.organizationId, sandbox.account);
        }

        // Update UI to show sandbox mode
        this.updateSandboxesForAccount(this.currentActiveAccount);
        
        this._log('log', 'Entered sandbox mode:', sandbox.name, 'for account:', sandbox.account || 'organization');
    }

    // Create a new sandbox for the current account
    createSandbox(sandboxName, sandboxType = 'account') {
        if (!this.currentActiveAccount) {
            this._log('error', 'No active account to create sandbox for');
            return;
        }

        if (sandboxType === 'organization') {
            return this.createOrganizationSandbox(sandboxName);
        }

        const timestamp = new Date().getTime();
        const accountSlug = this.createAccountSlug(this.currentActiveAccount);
        
        const newSandbox = {
            name: `${this.currentActiveAccount} - ${sandboxName}`,
            type: sandboxType,
            organization: null,
            account: this.currentActiveAccount,
            created: new Date().toISOString(),
            lastUsed: null,
            id: `${accountSlug}-custom-${timestamp}`,
            description: `Custom sandbox for ${this.currentActiveAccount}: ${sandboxName}`
        };

        // Add to account sandboxes
        const accountSandboxes = this.getSandboxesForAccount(this.currentActiveAccount);
        accountSandboxes.push(newSandbox);
        this.accountSandboxes[this.currentActiveAccount] = accountSandboxes;
        this.saveAccountSandboxes();

        // Update UI
        this.updateSandboxesForAccount(this.currentActiveAccount);
        
        this._log('log', 'Created new sandbox:', sandboxName, 'for account:', this.currentActiveAccount);
        return newSandbox;
    }

    // Create a new organization sandbox
    createOrganizationSandbox(sandboxName) {
        const activeAccountElement = this._domCache.activeAccount;
        const organizationId = activeAccountElement ? activeAccountElement.dataset.organization : null;
        
        if (!organizationId || organizationId === 'undefined') {
            this._log('error', '🚨 Cannot create organization sandbox: Current account is not part of a valid organization. OrganizationId:', organizationId);
            return;
        }

        const orgAccounts = this.organizationAccounts[organizationId] || [];
        const timestamp = new Date().getTime();
        
        // Get organization name for unique sandbox names
        const orgName = this.getOrganizationDisplayName(organizationId);
        const orgSlug = this.createOrganizationSlug(organizationId, orgName);
        
        const newOrganizationSandbox = {
            name: `${orgName} - ${sandboxName}`,
            type: 'organization',
            organizationId: organizationId,
            accounts: orgAccounts.map(acc => ({ ...acc })), // Clone accounts
            created: new Date().toISOString(),
            lastUsed: null,
            id: `${orgSlug}-custom-${timestamp}`, // Unique identifier for custom sandboxes
            description: `Custom organization sandbox for ${orgName} (${orgAccounts.length} accounts): ${sandboxName}`
        };

        // Add to organization sandboxes
        const organizationSandboxes = this.getOrganizationSandboxesForOrganization(organizationId);
        organizationSandboxes.push(newOrganizationSandbox);
        this.organizationSandboxes[organizationId] = organizationSandboxes;
        this.saveOrganizationSandboxes();

        // Update UI
        this.updateSandboxesForAccount(this.currentActiveAccount);
        
        this._log('log', 'Created new organization sandbox:', sandboxName, 'for organization:', organizationId);
        return newOrganizationSandbox;
    }

    // Delete a sandbox for the current account
    deleteSandbox(sandboxName) {
        if (!this.currentActiveAccount) {
            this._log('error', 'No active account to delete sandbox from');
            return;
        }

        const accountSandboxes = this.getSandboxesForAccount(this.currentActiveAccount);
        const filteredSandboxes = accountSandboxes.filter(sandbox => sandbox.name !== sandboxName);
        
        this.accountSandboxes[this.currentActiveAccount] = filteredSandboxes;
        this.saveAccountSandboxes();

        // Update UI
        this.updateSandboxesForAccount(this.currentActiveAccount);
        
        this._log('log', 'Deleted sandbox:', sandboxName, 'from account:', this.currentActiveAccount);
    }

    // Delete an organization sandbox
    deleteOrganizationSandbox(sandboxName, organizationId) {
        const organizationSandboxes = this.getOrganizationSandboxesForOrganization(organizationId);
        const filteredSandboxes = organizationSandboxes.filter(sandbox => sandbox.name !== sandboxName);
        
        this.organizationSandboxes[organizationId] = filteredSandboxes;
        this.saveOrganizationSandboxes();

        // Update UI
        this.updateSandboxesForAccount(this.currentActiveAccount);
        
        this._log('log', 'Deleted organization sandbox:', sandboxName, 'from organization:', organizationId);
    }

    // Get account statistics
    getAccountStats(accountName) {
        const sandboxes = this.getSandboxesForAccount(accountName);
        return {
            totalSandboxes: sandboxes.length,
            recentlyUsed: sandboxes.filter(s => s.lastUsed).length,
            createdToday: sandboxes.filter(s => {
                const created = new Date(s.created);
                const today = new Date();
                return created.toDateString() === today.toDateString();
            }).length
        };
    }

    // Get organization statistics
    getOrganizationStats(organizationId) {
        const orgSandboxes = this.getOrganizationSandboxesForOrganization(organizationId);
        return {
            totalSandboxes: orgSandboxes.length,
            recentlyUsed: orgSandboxes.filter(s => s.lastUsed).length,
            createdToday: orgSandboxes.filter(s => {
                const created = new Date(s.created);
                const today = new Date();
                return created.toDateString() === today.toDateString();
            }).length
        };
    }

    togglePanel(panelId) {
        const panel = document.getElementById(panelId);
        
        if (!panel) return;

        // If this panel is already open, close it
        if (this.currentOpenPanel === panelId) {
            this.closePanel(panelId);
            
            // If closing account panel and nav panel was previously expanded, restore it
            if (panelId === 'accountPanel' && this.previousNavPanelState) {
                this.openPanel(this.previousNavPanelState);
                this.currentOpenPanel = this.previousNavPanelState;
                this.previousNavPanelState = null;
            } else {
                this.currentOpenPanel = null;
            }
            return;
        }

        // If opening account panel, save current nav panel state
        if (panelId === 'accountPanel' && this.currentOpenPanel === 'navPanel') {
            this.previousNavPanelState = this.currentOpenPanel;
        }

        // Close the currently open panel (if any)
        if (this.currentOpenPanel) {
            this.closePanel(this.currentOpenPanel);
        }

        // Open the new panel
        this.openPanel(panelId);
        this.currentOpenPanel = panelId;
    }

    openPanel(panelId) {
        const panel = document.getElementById(panelId);
        if (panel) {
            panel.classList.add('expanded');
            
            // Add ARIA attributes for accessibility
            panel.setAttribute('aria-expanded', 'true');
            
            // Trigger animation
            this.animatePanel(panel, true);
        }
    }

    closePanel(panelId) {
        const panel = document.getElementById(panelId);
        if (panel) {
            panel.classList.remove('expanded');
            
            // Update ARIA attributes
            panel.setAttribute('aria-expanded', 'false');
            
            // Trigger animation
            this.animatePanel(panel, false);
        }
    }

    closeAllPanels() {
        this.panels.forEach(panel => {
            panel.classList.remove('expanded');
            panel.setAttribute('aria-expanded', 'false');
            this.animatePanel(panel, false);
        });
        this.currentOpenPanel = null;
        this.previousNavPanelState = null;
    }

    animatePanel(panel, isExpanding) {
        // Animation disabled for dashboard.html - uses CSS transitions instead
        // const content = panel.querySelector('.panel-content');
        // const title = panel.querySelector('.panel-title');
        // const navTexts = panel.querySelectorAll('.nav-text');
        // const dropdownIcon = panel.querySelector('.dropdown-icon');

        // if (isExpanding) {
        //     // Expanding animation
        //     setTimeout(() => {
        //         if (title) title.style.opacity = '1';
        //         if (dropdownIcon) dropdownIcon.style.opacity = '1';
        //         navTexts.forEach(text => {
        //             text.style.opacity = '1';
        //         });
        //     }, 100);
        // } else {
        //     // Collapsing animation
        //     if (title) title.style.opacity = '0';
        //     if (dropdownIcon) dropdownIcon.style.opacity = '0';
        //     navTexts.forEach(text => {
        //         text.style.opacity = '0';
        //     });
        // }
    }

    // Account Visibility Management
    loadHiddenAccounts() {
        try {
            const hiddenAccounts = localStorage.getItem('hiddenAccounts');
            return hiddenAccounts ? JSON.parse(hiddenAccounts) : [];
        } catch (error) {
            console.error('Error loading hidden accounts:', error);
            return [];
        }
    }

    saveHiddenAccounts(hiddenAccounts) {
        try {
            localStorage.setItem('hiddenAccounts', JSON.stringify(hiddenAccounts));
        } catch (error) {
            console.error('Error saving hidden accounts:', error);
        }
    }

    getAllAccounts() {
        const accounts = [];
        const accountElements = document.querySelectorAll('.account-panel .business-account');
        
        accountElements.forEach(element => {
            const accountName = element.dataset.accountName;
            const accountInitials = element.dataset.accountInitials;
            const accountColor = element.dataset.accountColor;
            
            if (accountName && accountInitials && accountColor) {
                accounts.push({
                    name: accountName,
                    initials: accountInitials,
                    color: accountColor,
                    element: element
                });
            }
        });
        
        return accounts;
    }

    hideAccount(accountName) {
        const hiddenAccounts = this.loadHiddenAccounts();
        if (!hiddenAccounts.includes(accountName)) {
            hiddenAccounts.push(accountName);
            this.saveHiddenAccounts(hiddenAccounts);
            this.updateAccountVisibility();
        }
    }

    showAccount(accountName) {
        let hiddenAccounts = this.loadHiddenAccounts();
        hiddenAccounts = hiddenAccounts.filter(name => name !== accountName);
        this.saveHiddenAccounts(hiddenAccounts);
        this.updateAccountVisibility();
    }

    updateAccountVisibility() {
        const hiddenAccounts = this.loadHiddenAccounts();
        const allAccounts = this.getAllAccounts();
        
        allAccounts.forEach(account => {
            const isHidden = hiddenAccounts.includes(account.name);
            if (isHidden) {
                account.element.classList.add('account-hidden');
            } else {
                account.element.classList.remove('account-hidden');
            }
        });
    }

    populateAccountVisibilityModal() {
        const accountList = document.getElementById('accountVisibilityList');
        const hiddenAccounts = this.loadHiddenAccounts();
        const allAccounts = this.getAllAccounts();
        
        if (!accountList) return;
        
        accountList.innerHTML = '';
        
        allAccounts.forEach(account => {
            const isVisible = !hiddenAccounts.includes(account.name);
            
            const accountItem = document.createElement('div');
            accountItem.className = 'account-visibility-item';
            accountItem.innerHTML = `
                <input type="checkbox" ${isVisible ? 'checked' : ''} data-account-name="${account.name}">
                <div class="account-info">
                    <div class="accountAvatar ${account.color}">${account.initials}</div>
                    <span class="account-name">${account.name}</span>
                </div>
            `;
            
            const checkbox = accountItem.querySelector('input[type="checkbox"]');
            checkbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    this.showAccount(account.name);
                } else {
                    this.hideAccount(account.name);
                }
            });
            
            // Allow clicking on the item to toggle checkbox
            accountItem.addEventListener('click', (e) => {
                if (e.target.type !== 'checkbox') {
                    checkbox.checked = !checkbox.checked;
                    checkbox.dispatchEvent(new Event('change'));
                }
            });
            
            accountList.appendChild(accountItem);
        });
    }

    showAllAccounts() {
        this.saveHiddenAccounts([]);
        this.updateAccountVisibility();
        this.populateAccountVisibilityModal();
    }

    hideAllAccounts() {
        const allAccounts = this.getAllAccounts();
        const allAccountNames = allAccounts.map(account => account.name);
        this.saveHiddenAccounts(allAccountNames);
        this.updateAccountVisibility();
        this.populateAccountVisibilityModal();
    }

    initAccountVisibility() {
        // Apply hidden account styles on load
        this.updateAccountVisibility();
        
        // Set up event handlers
        const visibilityButton = document.getElementById('accountVisibilityButton');
        const visibilityModal = document.getElementById('accountVisibilityModal');
        const closeButton = document.getElementById('closeAccountVisibilityModal');
        const showAllButton = document.getElementById('showAllAccounts');
        const hideAllButton = document.getElementById('hideAllAccounts');
        
        if (visibilityButton) {
            visibilityButton.addEventListener('click', () => {
                this.populateAccountVisibilityModal();
                visibilityModal.classList.add('show');
            });
        }
        
        if (closeButton) {
            closeButton.addEventListener('click', () => {
                visibilityModal.classList.remove('show');
            });
        }
        
        if (visibilityModal) {
            visibilityModal.addEventListener('click', (e) => {
                if (e.target === visibilityModal) {
                    visibilityModal.classList.remove('show');
                }
            });
        }
        
        if (showAllButton) {
            showAllButton.addEventListener('click', () => {
                this.showAllAccounts();
            });
        }
        
        if (hideAllButton) {
            hideAllButton.addEventListener('click', () => {
                this.hideAllAccounts();
            });
        }
        
        // Handle escape key to close modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && visibilityModal.classList.contains('show')) {
                visibilityModal.classList.remove('show');
            }
        });
    }

    // Business Account Creation
    getAvailableColors() {
        return ['color-1', 'color-2', 'color-3', 'color-4', 'color-5', 'color-6'];
    }

    getUsedColors() {
        const usedColors = [];
        const accountElements = document.querySelectorAll('.account-panel .business-account');
        
        accountElements.forEach(element => {
            const color = element.dataset.accountColor;
            if (color && !usedColors.includes(color)) {
                usedColors.push(color);
            }
        });
        
        return usedColors;
    }

    getNextAvailableColor() {
        const availableColors = this.getAvailableColors();
        const usedColors = this.getUsedColors();
        
        // Find first unused color
        for (const color of availableColors) {
            if (!usedColors.includes(color)) {
                return color;
            }
        }
        
        // If all colors are used, cycle through them
        return availableColors[usedColors.length % availableColors.length];
    }

    generateAccountInitials(accountName) {
        if (!accountName || accountName.trim().length === 0) {
            return 'AC';
        }
        
        const cleanName = accountName.trim();
        const words = cleanName.split(/\s+/);
        
        if (words.length === 1) {
            // Single word - take first two characters
            return cleanName.substring(0, 2).toUpperCase();
        } else {
            // Multiple words - take first letter of each word (up to 2)
            return words.slice(0, 2).map(word => word.charAt(0).toUpperCase()).join('');
        }
    }

    generateSubAccountNames(businessName, count) {
        if (count <= 0) return [];
        
        const templates = [
            `${businessName} Operations`,
            `${businessName} Sales`,
            `${businessName} Marketing`,
            `${businessName} Development`,
            `${businessName} Support`,
            `${businessName} Finance`,
            `${businessName} HR`,
            `${businessName} Legal`,
            `${businessName} Analytics`,
            `${businessName} Production`
        ];
        
        // Return the first 'count' templates, or cycle if we need more
        const subAccounts = [];
        for (let i = 0; i < count; i++) {
            if (i < templates.length) {
                subAccounts.push(templates[i]);
            } else {
                // If we need more than templates, add numbered accounts
                subAccounts.push(`${businessName} Dept ${i - templates.length + 1}`);
            }
        }
        
        return subAccounts;
    }

    previewAccounts(businessName, subAccountCount) {
        const accounts = [];
        
        if (!businessName || businessName.trim().length === 0) {
            return accounts;
        }
        
        const cleanBusinessName = businessName.trim();
        
        // Add the main business account
        const mainColor = this.getNextAvailableColor();
        accounts.push({
            name: cleanBusinessName,
            initials: this.generateAccountInitials(cleanBusinessName),
            color: mainColor,
            isMain: true
        });
        
        // Add sub-accounts if requested
        if (subAccountCount > 0) {
            const subAccountNames = this.generateSubAccountNames(cleanBusinessName, subAccountCount);
            const availableColors = this.getAvailableColors();
            const usedColors = this.getUsedColors();
            usedColors.push(mainColor); // Don't reuse the main account color
            
            subAccountNames.forEach((subName, index) => {
                // Assign colors, cycling through available ones
                let colorIndex = (usedColors.length + index) % availableColors.length;
                let color = availableColors[colorIndex];
                
                accounts.push({
                    name: subName,
                    initials: this.generateAccountInitials(subName),
                    color: color,
                    isMain: false
                });
            });
        }
        
        return accounts;
    }

    updateAccountPreview() {
        const businessNameInput = document.getElementById('businessName');
        const subAccountCountInput = document.getElementById('subAccountCount');
        const previewSection = document.getElementById('previewSection');
        const accountPreview = document.getElementById('accountPreview');
        const confirmButton = document.getElementById('confirmCreateAccount');
        
        const businessName = businessNameInput?.value?.trim() || '';
        const subAccountCount = parseInt(subAccountCountInput?.value || 0);
        
        if (businessName.length === 0) {
            previewSection.style.display = 'none';
            confirmButton.disabled = true;
            return;
        }
        
        const accounts = this.previewAccounts(businessName, subAccountCount);
        
        // Show preview
        previewSection.style.display = 'block';
        accountPreview.innerHTML = '';
        
        accounts.forEach(account => {
            const accountItem = document.createElement('div');
            accountItem.className = 'preview-account-item';
            accountItem.innerHTML = `
                <div class="accountAvatar ${account.color}">${account.initials}</div>
                <span class="account-name">${account.name}${account.isMain ? ' (Main)' : ''}</span>
            `;
            accountPreview.appendChild(accountItem);
        });
        
        // Enable confirm button
        confirmButton.disabled = false;
    }

    createBusinessAccounts(businessName, subAccountCount) {
        const accounts = this.previewAccounts(businessName, subAccountCount);
        
        if (accounts.length === 0) {
            console.error('No accounts to create');
            return;
        }
        
        // Get the account panel and find insertion point
        const accountPanel = document.querySelector('.account-panel .nav-group');
        if (!accountPanel) {
            console.error('Account panel not found');
            return;
        }
        
        // Find the divider to insert new accounts after it
        const divider = accountPanel.querySelector('.nav-divider');
        
        // Only create the main account in the account panel
        const mainAccount = accounts[0];
        const accountElement = document.createElement('div');
        accountElement.className = 'nav-component business-account';
        accountElement.setAttribute('data-tooltip', mainAccount.name);
        accountElement.setAttribute('data-account-name', mainAccount.name);
        accountElement.setAttribute('data-account-initials', mainAccount.initials);
        accountElement.setAttribute('data-account-color', mainAccount.color);
        
        // If we have sub-accounts, make this an organization
        if (subAccountCount > 0) {
            accountElement.classList.add('organization');
            const orgId = mainAccount.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
            accountElement.setAttribute('data-organization', orgId);
            
            console.log(`🏢 Creating organization account with ID: "${orgId}" for "${mainAccount.name}"`);
            console.log(`🏢 Organization element classes:`, accountElement.className);
            console.log(`🏢 Organization data attributes:`, {
                name: accountElement.getAttribute('data-account-name'),
                organization: accountElement.getAttribute('data-organization'),
                color: accountElement.getAttribute('data-account-color')
            });
            
            // Store sub-accounts in organization accounts structure
            const subAccounts = accounts.slice(1).map(subAccount => ({
                name: subAccount.name,
                initials: subAccount.initials,
                color: subAccount.color
            }));
            
            // Update the global organizationAccounts object
            if (typeof organizationAccounts !== 'undefined') {
                organizationAccounts[orgId] = subAccounts;
            } else {
                // Fallback: create global organizationAccounts if it doesn't exist
                window.organizationAccounts = window.organizationAccounts || {};
                window.organizationAccounts[orgId] = subAccounts;
            }
            
            console.log(`✅ Created organization "${mainAccount.name}" with ${subAccounts.length} sub-accounts:`, subAccounts.map(a => a.name).join(', '));
            console.log('📋 Organization data added to organizationAccounts:', orgId, subAccounts);
            console.log('📋 Current organizationAccounts structure:', typeof organizationAccounts !== 'undefined' ? organizationAccounts : window.organizationAccounts);
        }
        
        accountElement.innerHTML = `
            <div class="icon">
                <div class="accountAvatar ${mainAccount.color}">${mainAccount.initials}</div>
            </div>
            <span class="nav-text">${mainAccount.name}</span>
        `;
        
        // Add click handler
        accountElement.addEventListener('click', function(e) {
            e.stopPropagation();
            
            if (this.id === 'active-account') {
                return;
            }
            
            const businessAccountElement = this.closest('.business-account');
            if (businessAccountElement) {
                if (window.isInSandboxMode) {
                    window.exitSandboxMode();
                }
                window.updateActiveBusinessAccount(businessAccountElement);
                return;
            }
        });
        
        // Insert after the divider (with other business accounts)
        if (divider) {
            // Find the next element after the divider to insert before it
            let nextSibling = divider.nextElementSibling;
            if (nextSibling) {
                accountPanel.insertBefore(accountElement, nextSibling);
            } else {
                // If divider is the last element, append after it
                accountPanel.appendChild(accountElement);
            }
        } else {
            // If no divider exists, append at the end
            accountPanel.appendChild(accountElement);
        }
        
        // Update account visibility to include new account
        this.updateAccountVisibility();
        
        if (subAccountCount > 0) {
            console.log(`✅ Created organization account: ${mainAccount.name} (${subAccountCount} sub-accounts accessible via account switcher)`);
        } else {
            console.log(`✅ Created standalone business account: ${mainAccount.name}`);
        }
    }

    openCreateAccountModal() {
        const modal = document.getElementById('createAccountModal');
        const businessNameInput = document.getElementById('businessName');
        const subAccountCountInput = document.getElementById('subAccountCount');
        
        if (!modal) return;
        
        // Reset form
        if (businessNameInput) businessNameInput.value = '';
        if (subAccountCountInput) subAccountCountInput.value = '2';
        
        // Hide preview and disable confirm button
        const previewSection = document.getElementById('previewSection');
        const confirmButton = document.getElementById('confirmCreateAccount');
        if (previewSection) previewSection.style.display = 'none';
        if (confirmButton) confirmButton.disabled = true;
        
        modal.classList.add('show');
        
        // Focus on business name input
        setTimeout(() => {
            if (businessNameInput) businessNameInput.focus();
        }, 200);
    }

    closeCreateAccountModal() {
        const modal = document.getElementById('createAccountModal');
        if (modal) {
            modal.classList.remove('show');
        }
    }

    initCreateAccountModal() {
        const modal = document.getElementById('createAccountModal');
        const closeButton = document.getElementById('closeCreateAccountModal');
        const cancelButton = document.getElementById('cancelCreateAccount');
        const confirmButton = document.getElementById('confirmCreateAccount');
        const businessNameInput = document.getElementById('businessName');
        const subAccountCountInput = document.getElementById('subAccountCount');
        
        // Close handlers
        if (closeButton) {
            closeButton.addEventListener('click', () => {
                this.closeCreateAccountModal();
            });
        }
        
        if (cancelButton) {
            cancelButton.addEventListener('click', () => {
                this.closeCreateAccountModal();
            });
        }
        
        // Click outside to close
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeCreateAccountModal();
                }
            });
        }
        
        // Form input handlers
        if (businessNameInput) {
            businessNameInput.addEventListener('input', () => {
                this.updateAccountPreview();
            });
        }
        
        if (subAccountCountInput) {
            subAccountCountInput.addEventListener('input', () => {
                this.updateAccountPreview();
            });
        }
        
        // Confirm button handler
        if (confirmButton) {
            confirmButton.addEventListener('click', () => {
                const businessName = businessNameInput?.value?.trim() || '';
                const subAccountCount = parseInt(subAccountCountInput?.value || 0);
                
                if (businessName.length > 0) {
                    this.createBusinessAccounts(businessName, subAccountCount);
                    this.closeCreateAccountModal();
                }
            });
        }
        
        // Handle escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.classList.contains('show')) {
                this.closeCreateAccountModal();
            }
        });
    }
}

// Global functions for backward compatibility
function togglePanel(panelId) {
    if (window.dashboard) {
        window.dashboard.togglePanel(panelId);
    }
}

// Global functions for sandbox management
function createSandbox(sandboxName, sandboxType = 'account') {
    if (window.dashboard) {
        return window.dashboard.createSandbox(sandboxName, sandboxType);
    }
}

// Optimized global debugging function for testing sandbox isolation
function debugSandboxIsolation() {
    if (!window.dashboard) {
        console.error('Dashboard not available');
        return;
    }
    
    const isDebugMode = window.dashboard.debugMode;
    if (!isDebugMode) {
        console.log('Debug mode disabled. Enable by running on localhost.');
        return;
    }
    
    console.log('🔍 === SANDBOX ISOLATION DEBUG ===');
    
    const activeAccount = window.dashboard._domCache.activeAccount || document.getElementById('active-account');
    const currentAccount = activeAccount?.dataset.accountName || 'Unknown';
    const currentOrgId = activeAccount?.dataset.organization || 'Unknown';
    
    console.log(`🔍 Current: ${currentAccount} | Org: ${currentOrgId}`);
    console.log('🔍 Dashboard.currentActiveAccount:', window.dashboard.currentActiveAccount);
    
    // Show all account sandboxes (summarized)
    console.log('🔍 All account sandboxes in storage:');
    Object.entries(window.dashboard.accountSandboxes).forEach(([accountName, sandboxes]) => {
        console.log(`  ${accountName}: ${sandboxes.length} sandboxes (${sandboxes.length})`, sandboxes);
    });
    
    // Show organization sandboxes with issue detection
    console.log('🔍 All organization sandboxes in storage:');
    let brokenOrgSandboxes = 0;
    Object.entries(window.dashboard.organizationSandboxes).forEach(([orgId, sandboxes]) => {
        const isBroken = !orgId || orgId === 'undefined' || orgId === 'null';
        const status = isBroken ? '🚨 BROKEN' : '✅ OK';
        
        console.log(`  ${orgId} (${status}): ${sandboxes.length} sandboxes (${sandboxes.length})`, sandboxes);
        
        if (isBroken) {
            brokenOrgSandboxes += sandboxes.length;
        }
    });
    
    if (brokenOrgSandboxes > 0) {
        console.log(`🚨 Found ${brokenOrgSandboxes} broken organization sandboxes! Run cleanupBrokenOrganizationSandboxes() to fix.`);
    }
    
    // Show what sandboxes would be displayed for current account
    const currentSandboxes = window.dashboard.getSandboxesForAccount(currentAccount);
    console.log('🔍 Sandboxes for current account:', currentSandboxes.length, currentSandboxes);
    
    console.log('🔍 === END DEBUG ===');
}

// Global cleanup function for broken organization sandboxes
function cleanupBrokenOrganizationSandboxes() {
    if (!window.dashboard) {
        console.error('Dashboard not available');
        return;
    }
    return window.dashboard.cleanupBrokenOrganizationSandboxes();
}

// Optimized global function to upgrade existing sandboxes to new naming system
function upgradeExistingSandboxes() {
    if (!window.dashboard) {
        console.error('Dashboard not available');
        return;
    }
    
    const activeAccount = window.dashboard._domCache.activeAccount || document.getElementById('active-account');
    const accountName = activeAccount?.dataset.accountName;
    
    if (!accountName) {
        console.error('No active account found');
        return;
    }
    
    console.log(`🔄 Upgrading existing sandboxes for: ${accountName}`);
    
    const existingSandboxes = window.dashboard.accountSandboxes[accountName] || [];
    
    if (existingSandboxes.length === 0) {
        console.log('No existing sandboxes to upgrade, creating new defaults...');
        return recreateDefaultSandboxes();
    }
    
    console.log(`Found ${existingSandboxes.length} existing sandboxes to upgrade:`, 
                existingSandboxes.map(s => s.name));
    
    // Create new enhanced default sandboxes
    const newSandboxes = window.dashboard.getDefaultSandboxes(accountName);
    window.dashboard.accountSandboxes[accountName] = newSandboxes;
    window.dashboard.saveAccountSandboxes();
    
    console.log(`✅ Upgraded to ${newSandboxes.length} enhanced sandboxes:`, 
                newSandboxes.map(s => s.name));
    
    // Refresh the UI
    window.dashboard.updateSandboxesForAccount(accountName);
    
    return newSandboxes;
}

// Optimized global function to recreate default sandboxes for current account
function recreateDefaultSandboxes() {
    if (!window.dashboard) {
        console.error('Dashboard not available');
        return;
    }
    
    const activeAccount = window.dashboard._domCache.activeAccount || document.getElementById('active-account');
    const accountName = activeAccount?.dataset.accountName;
    
    if (!accountName) {
        console.error('No active account found');
        return;
    }
    
    console.log(`🔄 Recreating default sandboxes for: ${accountName}`);
    
    // Force recreation of default sandboxes
    const newSandboxes = window.dashboard.getDefaultSandboxes(accountName);
    window.dashboard.accountSandboxes[accountName] = newSandboxes;
    window.dashboard.saveAccountSandboxes();
    
    console.log(`✅ Created ${newSandboxes.length} default sandboxes for ${accountName}:`, 
                newSandboxes.map(s => s.name));
    
    // Refresh the UI
    window.dashboard.updateSandboxesForAccount(accountName);
    
    return newSandboxes;
}

// Global function to show examples of the new naming system
function showSandboxNamingExamples() {
    console.log('🎯 === SANDBOX NAMING EXAMPLES ===');
    console.log('');
    console.log('📁 Account Sandbox Examples:');
    console.log('  ✅ "Acme Corp Development Environment"');
    console.log('  ✅ "Acme Corp Staging Environment"');
    console.log('  ✅ "Acme Corp QA Testing"');
    console.log('  ✅ "Acme Corp - My Custom Feature"');
    console.log('');
    console.log('🏢 Organization Sandbox Examples:');
    console.log('  ✅ "Acme Inc Multi-Account Development"');
    console.log('  ✅ "Acme Inc Cross-Account Integration"');
    console.log('  ✅ "Acme Inc Production Rollout"');
    console.log('  ✅ "Acme Inc Security & Compliance"');
    console.log('  ✅ "Acme Inc - Company-wide Testing"');
    console.log('');
    console.log('🔧 Unique ID Examples:');
    console.log('  ✅ "acme-corp-dev-1721421234567"');
    console.log('  ✅ "acme-inc-integration-1721421234567"');
    console.log('  ✅ "beta-inc-custom-1721421234567"');
    console.log('');
    console.log('❌ Old Generic Names (FIXED):');
    console.log('  ❌ "Q3 Planning" → "Acme Inc Multi-Account Development"');
    console.log('  ❌ "Development" → "Acme Corp Development Environment"');
    console.log('  ❌ "Testing" → "Acme Corp QA Testing"');
    console.log('');
    console.log('🎯 === END EXAMPLES ===');
}

// Make debugging functions globally available
window.debugSandboxIsolation = debugSandboxIsolation;
window.cleanupBrokenOrganizationSandboxes = cleanupBrokenOrganizationSandboxes;
window.showSandboxNamingExamples = showSandboxNamingExamples;
window.recreateDefaultSandboxes = recreateDefaultSandboxes;
window.upgradeExistingSandboxes = upgradeExistingSandboxes;

function deleteSandbox(sandboxName) {
    if (window.dashboard) {
        return window.dashboard.deleteSandbox(sandboxName);
    }
}

function deleteOrganizationSandbox(sandboxName, organizationId) {
    if (window.dashboard) {
        return window.dashboard.deleteOrganizationSandbox(sandboxName, organizationId);
    }
}

function getAccountStats(accountName) {
    if (window.dashboard) {
        return window.dashboard.getAccountStats(accountName);
    }
}

function getOrganizationStats(organizationId) {
    if (window.dashboard) {
        return window.dashboard.getOrganizationStats(organizationId);
    }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.dashboard = new Dashboard();
    
    // Add some demo functionality for nav items
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            
            // Remove active class from all items
            navItems.forEach(navItem => navItem.classList.remove('active'));
            
            // Add active class to clicked item
            item.classList.add('active');
            
            // Get the text content for demo purposes
            const text = item.querySelector('.nav-text')?.textContent || 'Unknown';
            console.log(`Clicked on: ${text}`);
            
            // Update main content
            updateMainContent(text);
        });
    });

    // Add sandbox creation demo functionality
    const createSandboxButton = document.getElementById('create-sandbox-btn');
    if (createSandboxButton) {
        createSandboxButton.addEventListener('click', () => {
            const sandboxName = prompt('Enter sandbox name:');
            if (sandboxName) {
                window.dashboard.createSandbox(sandboxName);
            }
        });
    }

    // Log current account on page load
    const activeAccount = document.getElementById('active-account');
    if (activeAccount) {
        const accountName = activeAccount.dataset.accountName;
        const stats = window.dashboard.getAccountStats(accountName);
        console.log(`Active account: ${accountName}`, stats);
    }
});

// Optimized demo function to update main content
function updateMainContent(selectedItem) {
    // Debounce content updates to avoid excessive DOM manipulation
    if (updateMainContent._debounceTimer) {
        clearTimeout(updateMainContent._debounceTimer);
    }
    
    updateMainContent._debounceTimer = setTimeout(() => {
        const mainContent = document.querySelector('.content-wrapper');
        if (!mainContent) return;
        
        const timestamp = new Date().toLocaleTimeString();
        const currentAccount = window.dashboard?.currentActiveAccount || 'Unknown';
        
        // Only get stats if dashboard is available and debug mode is on
        let accountStats = {};
        if (window.dashboard && window.dashboard.debugMode) {
            accountStats = window.dashboard.getAccountStats(currentAccount) || {};
        }
        
        // Remove existing status message efficiently
        const existingStatus = mainContent.querySelector('.status-message');
        if (existingStatus) {
            existingStatus.remove();
        }
        
        // Create new status message
        const statusMessage = document.createElement('div');
        statusMessage.className = 'status-message';
        statusMessage.innerHTML = `
            <div style="
                background: #f0f8ff;
                padding: 16px;
                border-radius: 8px;
                border-left: 4px solid #007AFF;
                margin: 16px 0;
                font-size: 14px;
            ">
                <p><strong>Selected:</strong> ${selectedItem} at ${timestamp}</p>
                <p><strong>Active Account:</strong> ${currentAccount}</p>
                ${window.dashboard?.debugMode ? 
                    `<p><strong>Account Sandboxes:</strong> ${accountStats.totalSandboxes || 0} total, ${accountStats.recentlyUsed || 0} recently used</p>` : 
                    ''
                }
            </div>
        `;
        
        // Add new status message
        mainContent.appendChild(statusMessage);
    }, 100);
}

// Add CSS for active nav items and sandbox management
const style = document.createElement('style');
style.textContent = `
    .nav-item.active {
        background-color: #e3f2fd !important;
        color: #1976d2;
    }
    
    .nav-item.active .icon {
        color: #1976d2 !important;
    }
    
    .nav-item.active .nav-text {
        color: #1976d2 !important;
        font-weight: 500;
    }
    
    .sandbox-popover-item.account-specific {
        border-left: 3px solid #533AFD;
    }
    
    .sandbox-stats {
        font-size: 12px;
        color: #666;
        margin-top: 4px;
    }
    
    /* Tooltip hover effects with 60% opacity */
    [title]:hover {
        opacity: 0.6;
        transition: opacity 0.2s ease;
    }
    
    .mini-account-avatar:hover {
        opacity: 0.6;
        transition: opacity 0.2s ease;
    }
`;
document.head.appendChild(style); 