# Security Policy

## Responsible Disclosure

As an application built with a strong focus on **Cybersecurity Engineering**, we take the security of our patients' data and clinical records very seriously. If you discover a security vulnerability, we appreciate your help in disclosing it to us in a responsible manner.

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

Please do not report security vulnerabilities through public GitHub issues. Instead, follow these steps:

1. Send an email to **security-report@medical-saas.example.com** (replace with your actual contact).
2. Include a detailed description of the vulnerability.
3. Include steps to reproduce the issue (PoC).
4. Mention the potential impact and any suggested mitigations.

We will acknowledge receipt of your report within 48 hours and work with you to resolve the issue promptly.

## Our Approach

This project implements several native security layers:
- **Strict Environment Validation**: Powered by Zod to prevent configuration errors.
- **Forensic Auditing**: Every data mutation is logged with metadata (IP, UA, User) for non-repudiation.
- **Role-Based Access Control (RBAC)**: Strict isolation between Admin, Doctor, and Secretary roles.
- **JWT Authentication**: Secure stateless sessions with high-entropy secrets.

Thank you for helping keep our medical community safe!
