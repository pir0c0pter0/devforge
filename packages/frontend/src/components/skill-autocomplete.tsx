'use client'

import React, { useRef, useEffect, useState, useCallback } from 'react'
import { SKILL_CATEGORIES, filterSkills, type ClaudeSkill } from '@/lib/claude-skills'
import clsx from 'clsx'

interface SkillAutocompleteProps {
  value: string
  onChange: (value: string) => void
  onSubmit: (e: React.FormEvent) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

export function SkillAutocomplete({
  value,
  onChange,
  onSubmit,
  placeholder,
  disabled,
  className,
}: SkillAutocompleteProps) {
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [filteredSkills, setFilteredSkills] = useState<ClaudeSkill[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)

  // Filtrar skills quando o valor muda
  useEffect(() => {
    if (value.startsWith('/')) {
      const skills = filterSkills(value)
      setFilteredSkills(skills)
      setShowSuggestions(skills.length > 0)
      setSelectedIndex(0)
    } else {
      setShowSuggestions(false)
      setFilteredSkills([])
    }
  }, [value])

  // Scroll para item selecionado
  useEffect(() => {
    if (showSuggestions && suggestionsRef.current) {
      const selectedElement = suggestionsRef.current.children[selectedIndex] as HTMLElement
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [selectedIndex, showSuggestions])

  // Fechar sugestões ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        inputRef.current &&
        !inputRef.current.contains(e.target as Node) &&
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelectSkill = useCallback(
    (skill: ClaudeSkill) => {
      onChange(skill.name + ' ')
      setShowSuggestions(false)
      inputRef.current?.focus()
    },
    [onChange]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!showSuggestions) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          onSubmit(e as unknown as React.FormEvent)
        }
        return
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex((prev) => (prev + 1) % filteredSkills.length)
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex((prev) => (prev - 1 + filteredSkills.length) % filteredSkills.length)
          break
        case 'Enter':
          e.preventDefault()
          if (filteredSkills[selectedIndex]) {
            handleSelectSkill(filteredSkills[selectedIndex])
          }
          break
        case 'Tab':
          e.preventDefault()
          if (filteredSkills[selectedIndex]) {
            handleSelectSkill(filteredSkills[selectedIndex])
          }
          break
        case 'Escape':
          setShowSuggestions(false)
          break
      }
    },
    [showSuggestions, filteredSkills, selectedIndex, handleSelectSkill, onSubmit]
  )

  return (
    <div className="relative flex-1">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={clsx('input w-full', className)}
        disabled={disabled}
        autoComplete="off"
      />

      {/* Sugestões de skills - aparece para baixo */}
      {showSuggestions && filteredSkills.length > 0 && (
        <div
          ref={suggestionsRef}
          className="absolute top-full left-0 right-0 mt-1 max-h-64 overflow-y-auto bg-terminal-bgLight border border-terminal-border rounded-lg shadow-lg z-[100]"
        >
          {filteredSkills.map((skill, index) => {
            const category = SKILL_CATEGORIES[skill.category]
            return (
              <div
                key={skill.name}
                className={clsx(
                  'px-3 py-2 cursor-pointer flex items-center justify-between gap-2 transition-colors',
                  index === selectedIndex
                    ? 'bg-terminal-border text-terminal-text'
                    : 'hover:bg-terminal-bg text-terminal-textMuted'
                )}
                onClick={() => handleSelectSkill(skill)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-terminal-cyan">{skill.name}</span>
                    <span className={clsx('text-xs px-1.5 py-0.5 rounded', category.color, 'bg-terminal-bg')}>
                      {category.label}
                    </span>
                  </div>
                  <p className="text-xs text-terminal-textMuted truncate mt-0.5">
                    {skill.description}
                  </p>
                </div>
                {index === selectedIndex && (
                  <span className="text-xs text-terminal-textMuted flex-shrink-0">
                    Enter ↵
                  </span>
                )}
              </div>
            )
          })}
          <div className="px-3 py-1.5 text-xs text-terminal-textMuted border-t border-terminal-border bg-terminal-bg">
            ↑↓ navegar • Enter/Tab selecionar • Esc fechar
          </div>
        </div>
      )}

      {/* Hint para digitar / */}
      {!value && !disabled && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-terminal-textMuted pointer-events-none">
          Digite <span className="font-mono text-terminal-cyan">/</span> para skills
        </div>
      )}
    </div>
  )
}
