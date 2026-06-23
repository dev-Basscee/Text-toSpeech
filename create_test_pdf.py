from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch

# Create a simple test PDF
pdf_path = "test_sample.pdf"
c = canvas.Canvas(pdf_path, pagesize=letter)
width, height = letter

# Page 1
c.setFont("Helvetica-Bold", 24)
c.drawString(1*inch, height - 1*inch, "LexaRead Test Document")

c.setFont("Helvetica", 12)
y_pos = height - 2*inch
line_height = 0.3*inch

text = [
    "This is a test PDF for LexaRead.",
    "It contains simple text for testing the text-to-speech functionality.",
    "The text should be readable and highlightable during playback.",
    "",
    "Features to test:",
    "1. PDF rendering",
    "2. Text-to-speech playback",
    "3. Live text highlighting",
    "4. Page navigation",
    "5. Voice selection",
    "6. Speed and pitch adjustment",
    "",
    "This document has multiple sentences to ensure proper highlighting",
    "and audio synchronization works correctly throughout the document."
]

for line in text:
    c.drawString(1*inch, y_pos, line)
    y_pos -= line_height

# Page 2
c.showPage()
c.setFont("Helvetica-Bold", 20)
c.drawString(1*inch, height - 1*inch, "Page 2 - Additional Content")

c.setFont("Helvetica", 12)
y_pos = height - 2*inch

text2 = [
    "This is the second page of the test document.",
    "It tests page navigation functionality.",
    "",
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
    "Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
    "",
    "The application should:",
    "- Load and render this page correctly",
    "- Allow navigation between pages",
    "- Maintain reading state across pages",
    "- Support auto-advance to the next page",
]

for line in text2:
    c.drawString(1*inch, y_pos, line)
    y_pos -= line_height

c.save()
print(f"Test PDF created: {pdf_path}")
