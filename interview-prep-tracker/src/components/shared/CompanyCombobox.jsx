import React, { useState, useRef, useEffect } from 'react';
import { Search, Plus, Globe, Upload, Check, X } from 'lucide-react';
import { COMPANY_POOL } from '../../constants/companies';
import { getCompanyLogoUrl, guessDomain } from '../../utils/companyLogoUtils';
import { normalizeImage } from '../../utils/imageUtils';

/**
 * Renders a single company option in the dropdown list.
 *
 * @param {{ company: Object, isHighlighted: boolean, onSelect: Function, id: string }} props
 */
function CompanyOption({ company, isHighlighted, onSelect, id }) {
  const logoUrl = getCompanyLogoUrl(company.name);
  return (
    <li
      id={id}
      role="option"
      aria-selected={isHighlighted}
      className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition ${
        isHighlighted ? 'bg-purple-50 text-purple-900' : 'text-gray-700 hover:bg-gray-50'
      }`}
      onMouseDown={(e) => {
        e.preventDefault();
        onSelect(company);
      }}
    >
      {logoUrl ? (
        <img src={logoUrl} alt="" aria-hidden="true" width={20} height={20} className="rounded-sm shrink-0" />
      ) : (
        <span className="w-5 h-5 shrink-0" />
      )}
      <span className="text-sm truncate">{company.name}</span>
    </li>
  );
}

/**
 * Inline panel for adding a custom company with logo fetching or upload.
 *
 * @param {{ companyName: string, onConfirm: Function, onCancel: Function }} props
 */
function CustomCompanyPanel({ companyName, onConfirm, onCancel }) {
  const [domain, setDomain] = useState(() => guessDomain(companyName));
  const [logoUrl, setLogoUrl] = useState(null);
  const [customLogoUrl, setCustomLogoUrl] = useState(null);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const fileInputRef = useRef(null);

  function handleFetch() {
    if (!domain.trim()) return;
    setFetching(true);
    setFetchError(null);
    setCustomLogoUrl(null);

    const url = `/api/logo?domain=${encodeURIComponent(domain.trim())}`;
    const img = new Image();
    img.onload = () => {
      setLogoUrl(url);
      setFetching(false);
    };
    img.onerror = () => {
      setFetchError('Could not load logo');
      setFetching(false);
    };
    img.src = url;
  }

  async function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const dataUrl = await normalizeImage(file);
      setCustomLogoUrl(dataUrl);
      setLogoUrl(null);
      setFetchError(null);
    } catch {
      setFetchError('Failed to process image');
    }
  }

  function handleConfirm() {
    onConfirm({
      name: companyName,
      domain: domain.trim() || null,
      customLogoUrl: customLogoUrl || null,
    });
  }

  function handleSkip() {
    onConfirm({ name: companyName, domain: null, customLogoUrl: null });
  }

  const previewUrl = customLogoUrl || logoUrl;

  return (
    <div className="border border-gray-200 rounded-lg p-3 mt-2 bg-gray-50 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-gray-600">Add &ldquo;{companyName}&rdquo;</p>
        <button
          type="button"
          onClick={onCancel}
          className="text-gray-400 hover:text-gray-600 transition"
          aria-label="Cancel custom company"
        >
          <X size={14} />
        </button>
      </div>

      {/* Domain input + fetch */}
      <div className="flex gap-2">
        <div className="flex-1">
          <label htmlFor="custom-domain" className="sr-only">Company website domain</label>
          <div className="flex items-center gap-1 border border-gray-300 rounded-lg px-2 py-1.5 bg-white focus-within:ring-2 focus-within:ring-purple-500">
            <Globe size={14} className="text-gray-400 shrink-0" />
            <input
              id="custom-domain"
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="company.com"
              className="flex-1 text-sm outline-none"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={handleFetch}
          disabled={fetching || !domain.trim()}
          className="px-3 py-1.5 text-xs font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {fetching ? 'Fetching...' : 'Fetch Logo'}
        </button>
      </div>

      {/* Upload option */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800 transition"
        >
          <Upload size={12} />
          Upload logo
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileUpload}
          className="hidden"
          aria-label="Upload company logo"
        />
        <span className="text-xs text-gray-400">PNG, JPG, or SVG</span>
      </div>

      {fetchError && (
        <p className="text-xs text-red-500">{fetchError}</p>
      )}

      {/* Preview */}
      {previewUrl && (
        <div className="flex items-center gap-3">
          <img
            src={previewUrl}
            alt={`${companyName} logo preview`}
            width={48}
            height={48}
            className="rounded-md border border-gray-200"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleConfirm}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
            >
              <Check size={12} />
              Looks good
            </button>
            <button
              type="button"
              onClick={handleSkip}
              className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-200 rounded-lg hover:bg-gray-300 transition"
            >
              No logo
            </button>
          </div>
        </div>
      )}

      {/* No preview yet — allow skipping */}
      {!previewUrl && !fetching && (
        <button
          type="button"
          onClick={handleSkip}
          className="text-xs text-gray-500 hover:text-gray-700 underline transition"
        >
          Skip — add without logo
        </button>
      )}
    </div>
  );
}

/**
 * Searchable company combobox with logo thumbnails.
 *
 * Replaces the free-text company name input in AddCompanyModal.
 * Shows a filtered dropdown of COMPANY_POOL entries with logos.
 * When no exact match exists, offers an "Add custom company" option
 * with domain-based logo fetching and file upload.
 *
 * @param {{
 *   value:              string,
 *   onChange:            (name: string) => void,
 *   onCustomCompany:    (info: { name: string, domain: string|null, customLogoUrl: string|null }) => void,
 *   id?:                string,
 *   placeholder?:       string,
 * }} props
 */
export function CompanyCombobox({
  value,
  onChange,
  onCustomCompany,
  id = 'company-combobox',
  placeholder = 'Search companies...',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [showCustomPanel, setShowCustomPanel] = useState(false);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const query = value.toLowerCase();
  const filtered = query
    ? COMPANY_POOL.filter((c) => c.name.toLowerCase().includes(query))
    : COMPANY_POOL;

  const hasExactMatch = COMPANY_POOL.some((c) => c.name.toLowerCase() === query);
  const showAddOption = query.length > 0 && !hasExactMatch;

  // Reset highlight when filter changes
  useEffect(() => {
    setHighlightIndex(0);
  }, [query]);

  // Scroll highlighted option into view
  useEffect(() => {
    if (!listRef.current) return;
    const highlighted = listRef.current.querySelector('[aria-selected="true"]');
    if (highlighted) {
      highlighted.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightIndex]);

  function handleSelect(company) {
    onChange(company.name);
    setIsOpen(false);
    setShowCustomPanel(false);
  }

  function handleAddCustom() {
    setIsOpen(false);
    setShowCustomPanel(true);
  }

  function handleCustomConfirm(info) {
    onCustomCompany(info);
    setShowCustomPanel(false);
  }

  function handleKeyDown(e) {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    const totalItems = filtered.length + (showAddOption ? 1 : 0);

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightIndex((prev) => (prev + 1) % totalItems);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightIndex((prev) => (prev - 1 + totalItems) % totalItems);
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightIndex < filtered.length) {
          handleSelect(filtered[highlightIndex]);
        } else if (showAddOption) {
          handleAddCustom();
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        break;
    }
  }

  const activeDescendant = isOpen && filtered.length > 0
    ? `${id}-option-${highlightIndex}`
    : undefined;

  const selectedLogoUrl = getCompanyLogoUrl(value);

  return (
    <div className="relative">
      {/* Input with search icon and optional selected logo */}
      <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2 bg-white focus-within:ring-2 focus-within:ring-purple-500">
        {selectedLogoUrl && !isOpen ? (
          <img src={selectedLogoUrl} alt="" aria-hidden="true" width={18} height={18} className="rounded-sm shrink-0" />
        ) : (
          <Search size={16} className="text-gray-400 shrink-0" />
        )}
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={`${id}-listbox`}
          aria-activedescendant={activeDescendant}
          aria-autocomplete="list"
          autoComplete="off"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setIsOpen(true);
            setShowCustomPanel(false);
          }}
          onFocus={() => setIsOpen(true)}
          onBlur={() => {
            // Delay to allow click on option
            setTimeout(() => setIsOpen(false), 150);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1 text-sm outline-none"
          maxLength={100}
        />
      </div>

      {/* Dropdown */}
      {isOpen && (filtered.length > 0 || showAddOption) && (
        <ul
          ref={listRef}
          id={`${id}-listbox`}
          role="listbox"
          className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg"
        >
          {filtered.map((company, i) => (
            <CompanyOption
              key={company.slug}
              company={company}
              isHighlighted={i === highlightIndex}
              onSelect={handleSelect}
              id={`${id}-option-${i}`}
            />
          ))}
          {showAddOption && (
            <li
              id={`${id}-option-${filtered.length}`}
              role="option"
              aria-selected={highlightIndex === filtered.length}
              className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition border-t border-gray-100 ${
                highlightIndex === filtered.length
                  ? 'bg-purple-50 text-purple-900'
                  : 'text-purple-600 hover:bg-gray-50'
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                handleAddCustom();
              }}
            >
              <Plus size={16} className="shrink-0" />
              <span className="text-sm">Add &ldquo;{value}&rdquo; as custom company</span>
            </li>
          )}
        </ul>
      )}

      {/* Custom company panel */}
      {showCustomPanel && (
        <CustomCompanyPanel
          companyName={value}
          onConfirm={handleCustomConfirm}
          onCancel={() => setShowCustomPanel(false)}
        />
      )}
    </div>
  );
}
