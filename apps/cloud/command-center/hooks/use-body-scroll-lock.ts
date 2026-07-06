"use client"

import { useEffect } from "react"

export function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return

    const scrollY = window.scrollY
    const body = document.body
    const html = document.documentElement
    const previousOverflow = document.body.style.overflow
    const previousBodyPosition = document.body.style.position
    const previousBodyTop = document.body.style.top
    const previousBodyLeft = document.body.style.left
    const previousBodyRight = document.body.style.right
    const previousBodyWidth = document.body.style.width
    const previousBodyHeight = document.body.style.height
    const previousHtmlOverflow = document.documentElement.style.overflow
    const previousHtmlHeight = document.documentElement.style.height
    const previousHtmlOverscroll = document.documentElement.style.overscrollBehavior
    const previousBodyOverscroll = document.body.style.overscrollBehavior
    const previousScrollBehavior = html.style.scrollBehavior

    html.style.scrollBehavior = "auto"
    html.style.overflow = "hidden"
    html.style.overscrollBehavior = "none"
    body.style.overflow = "hidden"
    body.style.position = "fixed"
    body.style.top = `-${scrollY}px`
    body.style.left = "0"
    body.style.right = "0"
    body.style.width = "100%"
    body.style.overscrollBehavior = "none"

    return () => {
      html.style.scrollBehavior = previousScrollBehavior
      html.style.overflow = previousHtmlOverflow
      html.style.height = previousHtmlHeight
      html.style.overscrollBehavior = previousHtmlOverscroll
      body.style.overflow = previousOverflow
      body.style.position = previousBodyPosition
      body.style.top = previousBodyTop
      body.style.left = previousBodyLeft
      body.style.right = previousBodyRight
      body.style.width = previousBodyWidth
      body.style.height = previousBodyHeight
      body.style.overscrollBehavior = previousBodyOverscroll
      window.scrollTo(0, scrollY)
    }
  }, [locked])
}
