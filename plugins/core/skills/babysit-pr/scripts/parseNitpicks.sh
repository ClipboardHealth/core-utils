#!/usr/bin/env bash
# parseNitpicks.sh — Parse bot review-body comments from PR review bodies.
#
# Each emitted comment includes a stable `fingerprint` field (sha256 of file +
# normalized line range + title + body), so reposted reviews dedupe to the same
# fingerprint. Source review timestamps are kept as `createdAt` metadata but
# NOT included in the fingerprint.
#
# Sourced by unresolvedPrComments.sh. Requires: perl with Digest::SHA + Encode.

extract_nitpick_comments() {
  local reviews_json="$1"

  printf '%s' "$reviews_json" | perl -e '
use strict;
use warnings;
use JSON::PP;
use Digest::SHA qw(sha256_hex);
use Encode qw(encode_utf8);

local $/;
my $reviews_json = <STDIN>;
my $reviews = decode_json($reviews_json);

my @comments = (
  extract_coderabbit_comments($reviews),
  extract_mendral_comments($reviews),
);
print encode_json(\@comments);

sub extract_coderabbit_comments {
  my ($reviews) = @_;

  my $latest_review;
  my $latest_time = "";
  for my $review (@$reviews) {
    my $author = $review->{author}{login} // "";
    my $body = $review->{body} // "";
    next unless $author eq "coderabbitai" && has_supported_sections($body);
    my $created = $review->{createdAt} // "";
    if ($created gt $latest_time) {
      $latest_time = $created;
      $latest_review = $review;
    }
  }

  return () unless $latest_review;

  my $body = $latest_review->{body};
  my $author = $latest_review->{author}{login} // "deleted-user";
  my $created_at = $latest_review->{createdAt} // "";

  my @sections = extract_review_body_comment_sections($body);
  return () unless @sections;

  my @comments;
  for my $section (@sections) {
    my $section_content = $section->{content};
    my $category = $section->{category};

    while ($section_content =~ /<details>\s*<summary>([^<]+?)\s+\(\d+\)<\/summary>\s*<blockquote>([\s\S]*?)<\/blockquote>\s*<\/details>/g) {
      my $raw_file_name = trim($1);
      my $file_content = $2;

      # Category prefix is optional. CodeRabbit emits 0–N `_…_` tags
      # separated by `|` (e.g. `_⚠️ Potential issue_ | _🟠 Major_ | _⚡ Quick win_`
      # or just `_💤 Low value_` on lower-confidence findings). The previous
      # regex required exactly two tags and silently dropped one-tag and
      # three-tag variants.
      while ($file_content =~ /`(\d+(?:-\d+)?)`:\s*(?:_[^_]+_(?:\s*\|\s*_[^_]+_)*\s*)?\*\*([^*]+)\*\*\s*([\s\S]*?)(?=---|\n`\d|<\/blockquote>|$)/g) {
        my $line_range = $1;
        my $title = trim($2);
        my $clean_body = clean_comment_body(trim($3));
        my $file_name = normalize_file_name($raw_file_name, $line_range);

        push @comments, review_body_comment(
          $author,
          $created_at,
          $file_name,
          $line_range,
          $title,
          $clean_body,
          $category,
        );
      }
    }
  }

  return @comments;
}

sub extract_mendral_comments {
  my ($reviews) = @_;

  my $latest_review;
  my $latest_time = "";
  for my $review (@$reviews) {
    my $author = $review->{author}{login} // "";
    my $body = $review->{body} // "";
    next unless ($author eq "mendral-app" || $author eq "mendral-app[bot]") && is_actionable_mendral_review($body);
    my $created = $review->{createdAt} // "";
    if ($created gt $latest_time) {
      $latest_time = $created;
      $latest_review = $review;
    }
  }

  return () unless $latest_review;

  my $body = $latest_review->{body} // "";
  my $title = mendral_title($body);
  return () unless $title;

  my $clean_body = clean_mendral_body($body);
  return () unless $clean_body ne "";

  my ($file_name, $line_range) = extract_first_file_line_reference($clean_body);
  return () unless $file_name && $line_range;

  return review_body_comment(
    $latest_review->{author}{login} // "deleted-user",
    $latest_review->{createdAt} // "",
    $file_name,
    $line_range,
    $title,
    $clean_body,
    "mendral",
  );
}

sub review_body_comment {
  my ($author, $created_at, $file_name, $line_range, $title, $clean_body, $category) = @_;

  # Fingerprint: file + normalized line + title + body (NO timestamp,
  # NO author, NO category — reposted reviews must dedupe to the same
  # fingerprint even if a review bot relabels the section).
  my $fingerprint_input = join("\n", $file_name, $line_range, $title, $clean_body);
  my $fingerprint = substr(sha256_hex(encode_utf8($fingerprint_input)), 0, 16);

  return {
    author      => $author,
    body        => "$title\n\n$clean_body",
    category    => $category,
    createdAt   => $created_at,
    file        => $file_name,
    fingerprint => $fingerprint,
    line        => $line_range,
    title       => $title,
  };
}

sub has_supported_sections {
  my ($text) = @_;
  $text = strip_markdown_blockquote_prefixes($text);
  return $text =~ /<summary>\s*[^<]*(?:Nitpick comments|Minor comments|Outside diff range comments)\s*\(\d+\)<\/summary>\s*<blockquote>/i;
}

sub is_actionable_mendral_review {
  my ($text) = @_;
  my $title = mendral_title($text);
  return defined $title && $title =~ /^(?:needs attention|changes requested|needs changes)$/i;
}

sub mendral_title {
  my ($text) = @_;
  $text = strip_markdown_blockquote_prefixes($text);
  return $1 if $text =~ /^\s*\*\*([^*]+)\*\*/m;
  return undef;
}

sub clean_mendral_body {
  my ($text) = @_;
  $text = strip_markdown_blockquote_prefixes($text);
  $text =~ s/^\s*\*\*[^*]+\*\*\s*//;
  $text =~ s/<details>[\s\S]*$//;
  $text =~ s/<sub>[\s\S]*?<\/sub>//g;
  $text =~ s/<!--[\s\S]*?-->//g;
  return trim($text);
}

sub extract_first_file_line_reference {
  my ($text) = @_;
  $text =~ s/\x{2013}|\x{2014}/-/g;

  if ($text =~ /`([^`\n]+\/[^`\n]+\.[A-Za-z0-9]+)`[^\n]{0,120}?\blines?\s+(\d+(?:\s*(?:-|to)\s*\d+)?)/i) {
    return ($1, normalize_line_range($2));
  }

  return (undef, undef);
}

sub normalize_line_range {
  my ($line_range) = @_;
  $line_range = trim($line_range);
  return "$1-$2" if $line_range =~ /^(\d+)\s*(?:-|to)\s*(\d+)$/i;
  return $line_range;
}

sub extract_review_body_comment_sections {
  my ($text) = @_;
  $text = strip_markdown_blockquote_prefixes($text);

  my @sections;
  while ($text =~ /<summary>\s*[^<]*(Nitpick comments|Minor comments|Outside diff range comments)\s*\(\d+\)<\/summary>\s*<blockquote>/ig) {
    my $category = section_category($1);
    my $content_start = $+[0];
    my $after = substr($text, $content_start);

    my $depth = 1;
    my @tags;
    while ($after =~ /(<blockquote>|<\/blockquote>)/gi) {
      my $tag = $1;
      my $pos = $-[0];
      my $is_open = ($tag =~ /^<blockquote>/i) ? 1 : 0;
      push @tags, [$pos, $is_open];
    }
    for my $tag (@tags) {
      $depth += $tag->[1] ? 1 : -1;
      if ($depth == 0) {
        push @sections, {
          category => $category,
          content  => substr($after, 0, $tag->[0]),
        };
        last;
      }
    }
  }
  return @sections;
}

sub section_category {
  my ($label) = @_;
  return "nitpick" if $label =~ /Nitpick comments/i;
  return "minor" if $label =~ /Minor comments/i;
  return "outside-diff" if $label =~ /Outside diff range comments/i;
  return "unknown";
}

sub normalize_file_name {
  my ($file_name, $line_range) = @_;
  my $suffix = "-" . $line_range;
  $file_name =~ s/\Q$suffix\E$//;
  return $file_name;
}

sub strip_markdown_blockquote_prefixes {
  my ($text) = @_;
  $text =~ s/^[ \t]*>[ \t]?//mg;
  return $text;
}

sub clean_comment_body {
  my ($text) = @_;
  my $prev = "";
  while ($text ne $prev) {
    $prev = $text;
    $text =~ s/<details>(?:(?!<details>)[\s\S])*?<\/details>//g;
  }
  # Do NOT HTML-escape angle brackets: the nitpick body is posted back to GitHub
  # as Markdown via `gh api`, where `&lt;`/`&gt;` would render literally and
  # corrupt generic-type expressions or HTML snippets from the original review.
  return trim($text);
}

sub trim {
  my ($s) = @_;
  $s =~ s/^\s+//;
  $s =~ s/\s+$//;
  return $s;
}
'
}
